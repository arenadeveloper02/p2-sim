import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { truncate } from '@sim/utils/string'
import {
  domainSystemHint,
  filterToolsByNames,
  toolNamesForDomain,
  type LocalCopilotSpecialistDomain,
} from '@/local-copilot/lib/agent/specialists/domains'
import { runToolWithStatus } from '@/local-copilot/lib/agent/run-tool-with-status'
import type { LocalTurnCostAccumulator } from '@/local-copilot/lib/billing/turn-cost-accumulator'
import { getLocalCopilotMemorySnapshot } from '@/local-copilot/lib/diagnostics'
import type { ChatMessage, LocalCopilotProvider } from '@/local-copilot/lib/providers/types'
import type { ToolExecutionContext } from '@/local-copilot/lib/tools/executor'
import {
  formatToolResultForLlm,
  sortToolCallsForExecution,
} from '@/local-copilot/lib/tools/format-tool-result'
import type { LocalCopilotStreamEvent, LocalCopilotToolDefinition } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotSpecialistPass')

/** Hard cap — specialist pass must not consume the whole turn budget. */
export const SPECIALIST_PASS_MAX_ROUNDS = 3

/** Max chars of aggregated specialist findings injected into the parent prompt. */
export const SPECIALIST_FINDINGS_MAX_CHARS = 12_000

export interface RunSpecialistPassParams {
  domain: LocalCopilotSpecialistDomain
  userMessage: string
  model: string
  provider: LocalCopilotProvider
  allTools: LocalCopilotToolDefinition[]
  toolCtx: ToolExecutionContext
  signal?: AbortSignal
  userId: string
  workspaceId: string
  workflowId?: string
  usageTurnId: string
  /**
   * Shared with the parent turn so specialist model/tool cost flushes once via
   * `recordLocalCopilotTurnUsage` with chatId / runId / message-scoped keys.
   */
  turnCost: LocalTurnCostAccumulator
  getToolExecutor: () => Promise<typeof import('@/local-copilot/lib/tools/executor')>
}

export interface SpecialistPassResult {
  domain: LocalCopilotSpecialistDomain
  findings: string
  toolRoundCount: number
  events: LocalCopilotStreamEvent[]
}

/**
 * Runs a bounded specialist loop and collects SSE events (does not yield).
 * Used by the sequential Phase 3 pass and Phase 4 parallel fan-out.
 */
export async function executeSpecialistLoop(
  params: RunSpecialistPassParams
): Promise<SpecialistPassResult> {
  const events: LocalCopilotStreamEvent[] = []
  const allowed = toolNamesForDomain(params.domain)
  const tools = filterToolsByNames(params.allTools, allowed.size > 0 ? allowed : null)

  if (tools.length === 0 || params.domain === 'general') {
    return { domain: params.domain, findings: '', toolRoundCount: 0, events }
  }

  events.push({
    type: 'status',
    message: `Consulting ${params.domain} specialist…`,
  })

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a focused Arena Copilot specialist (${params.domain}). ${domainSystemHint(params.domain)} Gather facts with tools, then stop. Do not build or deploy workflows unless that is your domain. Keep the final reply under 8 sentences.`,
    },
    { role: 'user', content: params.userMessage },
  ]

  const findings: string[] = []
  let toolRoundCount = 0

  for (let round = 0; round < SPECIALIST_PASS_MAX_ROUNDS; round++) {
    if (params.signal?.aborted) break

    const pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = []
    let assistantText = ''
    let roundInputTokens = 0
    let roundOutputTokens = 0

    try {
      for await (const chunk of params.provider.chatCompletionStream({
        model: params.model,
        messages,
        tools,
        signal: params.signal,
      })) {
        if (chunk.type === 'text' && chunk.content) {
          assistantText += chunk.content
        }
        if (chunk.type === 'tool_call' && chunk.toolCall) {
          pendingToolCalls.push(chunk.toolCall)
        }
        if (chunk.type === 'done' && chunk.usage) {
          roundInputTokens = chunk.usage.inputTokens
          roundOutputTokens = chunk.usage.outputTokens
        }
      }
    } catch (error) {
      logger.warn('Specialist pass model round failed', {
        domain: params.domain,
        round,
        error: getErrorMessage(error, 'specialist round failed'),
      })
      break
    }

    if (roundInputTokens > 0 || roundOutputTokens > 0) {
      // Accumulate into the parent turn ledger — do not call recordModelUsage
      // here (that writes null chat_id rows and can double-count vs end-of-turn).
      params.turnCost.addModelUsage({
        model: params.model,
        inputTokens: roundInputTokens,
        outputTokens: roundOutputTokens,
      })
    }

    logger.info('Arena Copilot specialist round finished', {
      domain: params.domain,
      round,
      usageTurnId: params.usageTurnId,
      toolCallCount: pendingToolCalls.length,
      toolNames: pendingToolCalls.map((call) => call.name),
      memory: getLocalCopilotMemorySnapshot(),
    })

    if (pendingToolCalls.length === 0) {
      if (assistantText.trim()) {
        findings.push(assistantText.trim())
      }
      break
    }

    toolRoundCount += 1
    const ordered = sortToolCallsForExecution(pendingToolCalls)
    messages.push({
      role: 'assistant',
      content: assistantText,
      toolCalls: ordered,
    })

    for (const call of ordered) {
      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = JSON.parse(call.arguments || '{}') as Record<string, unknown>
      } catch {
        parsedArgs = {}
      }

      events.push({
        type: 'tool_call_start',
        toolCallId: call.id,
        toolName: call.name,
        args: parsedArgs,
      })

      const { executeLocalCopilotTool } = await params.getToolExecutor()
      const toolStatus = runToolWithStatus({
        toolCallId: call.id,
        toolName: call.name,
        args: parsedArgs,
        abortSignal: params.signal,
        execute: (onProgress) =>
          executeLocalCopilotTool(call.name, parsedArgs, { ...params.toolCtx, onProgress }),
      })

      let next = await toolStatus.next()
      while (!next.done) {
        events.push(next.value)
        next = await toolStatus.next()
      }
      const toolResult = next.value

      events.push({
        type: 'tool_call_result',
        toolCallId: call.id,
        toolName: call.name,
        success: toolResult.success,
        output: toolResult.result,
        ...(toolResult.error ? { error: toolResult.error } : {}),
        ...(toolResult.resources?.length ? { resources: toolResult.resources } : {}),
      })

      params.turnCost.addToolBilling({
        toolName: call.name,
        billing: toolResult.billing,
      })

      const llmPayload = formatToolResultForLlm(call.name, toolResult.result ?? toolResult.error)
      findings.push(truncate(`[${call.name}] ${llmPayload}`, 4_000))

      messages.push({
        role: 'tool',
        toolCallId: call.id,
        content: llmPayload,
      })
    }
  }

  return {
    domain: params.domain,
    findings: truncate(findings.filter(Boolean).join('\n\n'), SPECIALIST_FINDINGS_MAX_CHARS),
    toolRoundCount,
    events,
  }
}

/**
 * Bounded specialist loop with a domain tool subset.
 * Yields the same SSE-shaped events as the parent so the UI stays unified.
 */
export async function* runSpecialistPass(
  params: RunSpecialistPassParams
): AsyncGenerator<LocalCopilotStreamEvent, SpecialistPassResult> {
  const result = await executeSpecialistLoop(params)
  for (const event of result.events) {
    yield event
  }
  return result
}
