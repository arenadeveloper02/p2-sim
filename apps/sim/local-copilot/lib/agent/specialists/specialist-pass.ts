import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { truncate } from '@sim/utils/string'
import { recordModelUsage } from '@/lib/billing/core/record-model-usage.server'
import type { SpecialistBudget } from '@/local-copilot/lib/agent/specialists/budget'
import {
  domainSystemHint,
  filterToolsByNames,
  toolNamesForDomain,
  type LocalCopilotCloudSpecialistDomain,
  type LocalCopilotSpecialistDomain,
} from '@/local-copilot/lib/agent/specialists/domains'
import {
  buildSpecialistUserMessage,
  getParentSpecialistToolDefinitions,
  isSpecialistTool,
} from '@/local-copilot/lib/agent/specialists/specialist-tools'
import { runToolWithStatus } from '@/local-copilot/lib/agent/run-tool-with-status'
import { getLocalCopilotMemorySnapshot } from '@/local-copilot/lib/diagnostics'
import type { ChatMessage, LocalCopilotProvider } from '@/local-copilot/lib/providers/types'
import type { ToolExecutionContext } from '@/local-copilot/lib/tools/executor'
import {
  formatToolResultForLlm,
  sortToolCallsForExecution,
} from '@/local-copilot/lib/tools/format-tool-result'
import type { LocalCopilotStreamEvent, LocalCopilotToolDefinition } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotSpecialistPass')

export const SPECIALIST_PASS_MAX_ROUNDS = 3
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
  getToolExecutor: () => Promise<typeof import('@/local-copilot/lib/tools/executor')>
  budget: SpecialistBudget
  parentDepth?: number
}

export interface SpecialistPassResult {
  domain: LocalCopilotSpecialistDomain
  findings: string
  toolRoundCount: number
  events: LocalCopilotStreamEvent[]
  success: boolean
  error?: string
  depth?: number
}

function mergeAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      return controller.signal
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  }
  return controller.signal
}

async function withTimeoutSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number
): Promise<{ signal: AbortSignal; clear: () => void }> {
  const timeoutController = new AbortController()
  const timer = setTimeout(() => {
    timeoutController.abort(new Error(`Specialist timed out after ${timeoutMs}ms`))
  }, timeoutMs)
  const signal = parent
    ? mergeAbortSignals([parent, timeoutController.signal])
    : timeoutController.signal
  return { signal, clear: () => clearTimeout(timer) }
}

function buildSpecialistTools(
  domain: LocalCopilotSpecialistDomain,
  allTools: LocalCopilotToolDefinition[],
  depth: number,
  maxDepth: number
): LocalCopilotToolDefinition[] {
  const allowed = toolNamesForDomain(domain)
  const leafTools = filterToolsByNames(allTools, allowed.size > 0 ? allowed : null)
  if (depth >= maxDepth) return leafTools
  const leafNames = new Set(leafTools.map((tool) => tool.name))
  const specialistTools = getParentSpecialistToolDefinitions().filter(
    (tool) => !leafNames.has(tool.name)
  )
  return [...leafTools, ...specialistTools]
}

export async function executeSpecialistLoop(
  params: RunSpecialistPassParams
): Promise<SpecialistPassResult> {
  const parentDepth = params.parentDepth ?? 0
  const entered = params.budget.tryEnter(parentDepth)
  if (!entered.ok) {
    return {
      domain: params.domain,
      findings: entered.reason,
      toolRoundCount: 0,
      events: [{ type: 'status', message: `${params.domain} specialist skipped: ${entered.reason}` }],
      success: false,
      error: entered.reason,
    }
  }

  const { signal, clear } = await withTimeoutSignal(params.signal, params.budget.timeoutMs)
  const events: LocalCopilotStreamEvent[] = []

  try {
    if (params.domain === 'general') {
      return {
        domain: params.domain,
        findings: '',
        toolRoundCount: 0,
        events,
        success: true,
        depth: entered.depth,
      }
    }

    const tools = buildSpecialistTools(
      params.domain,
      params.allTools,
      entered.depth,
      params.budget.maxDepth
    )
    if (tools.length === 0) {
      return {
        domain: params.domain,
        findings: '',
        toolRoundCount: 0,
        events,
        success: true,
        depth: entered.depth,
      }
    }

    events.push({ type: 'status', message: `Consulting ${params.domain} specialist…` })

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a focused Arena Copilot specialist (${params.domain}). ${domainSystemHint(params.domain)} Complete the request using your tools — you may perform domain writes when needed. You may call other specialist tools if another domain is required (nesting is budgeted). Keep the final reply under 8 sentences with actionable facts and outcomes.`,
      },
      { role: 'user', content: params.userMessage },
    ]

    const findings: string[] = []
    let toolRoundCount = 0

    for (let round = 0; round < SPECIALIST_PASS_MAX_ROUNDS; round++) {
      if (signal.aborted) break

      const pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = []
      let assistantText = ''
      let roundInputTokens = 0
      let roundOutputTokens = 0

      try {
        for await (const chunk of params.provider.chatCompletionStream({
          model: params.model,
          messages,
          tools,
          signal,
        })) {
          if (chunk.type === 'text' && chunk.content) assistantText += chunk.content
          if (chunk.type === 'tool_call' && chunk.toolCall) pendingToolCalls.push(chunk.toolCall)
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
        await recordModelUsage({
          userId: params.userId,
          workspaceId: params.workspaceId,
          workflowId: params.workflowId,
          model: params.model,
          inputTokens: roundInputTokens,
          outputTokens: roundOutputTokens,
          source: 'copilot',
          sourceReference: `local-copilot:${params.usageTurnId}:specialist-${params.domain}-${entered.depth}-${round}`,
        })
      }

      logger.info('Arena Copilot specialist round finished', {
        domain: params.domain,
        depth: entered.depth,
        round,
        toolCallCount: pendingToolCalls.length,
        toolNames: pendingToolCalls.map((call) => call.name),
        budget: params.budget.snapshot(),
        memory: getLocalCopilotMemorySnapshot(),
      })

      if (pendingToolCalls.length === 0) {
        if (assistantText.trim()) findings.push(assistantText.trim())
        break
      }

      toolRoundCount += 1
      const ordered = sortToolCallsForExecution(pendingToolCalls)
      messages.push({ role: 'assistant', content: assistantText, toolCalls: ordered })

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

        if (isSpecialistTool(call.name)) {
          const childDomain = call.name as LocalCopilotCloudSpecialistDomain
          const nested = await executeSpecialistLoop({
            ...params,
            domain: childDomain,
            userMessage: buildSpecialistUserMessage(childDomain, parsedArgs, params.userMessage),
            signal,
            parentDepth: entered.depth,
          })
          for (const event of nested.events) events.push(event)

          const nestedOutput = {
            success: nested.success,
            domain: nested.domain,
            findings: nested.findings,
            ...(nested.error ? { error: nested.error } : {}),
          }
          findings.push(
            truncate(
              `[${call.name}] ${nested.success ? nested.findings : (nested.error ?? 'failed')}`,
              4_000
            )
          )
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: formatToolResultForLlm(call.name, nestedOutput),
          })
          events.push({
            type: 'tool_call_result',
            toolCallId: call.id,
            toolName: call.name,
            success: nested.success,
            output: nestedOutput,
            ...(nested.error ? { error: nested.error } : {}),
          })
          continue
        }

        const { executeLocalCopilotTool, refreshToolContext } = await params.getToolExecutor()
        const toolStatus = runToolWithStatus({
          toolCallId: call.id,
          toolName: call.name,
          args: parsedArgs,
          abortSignal: signal,
          execute: (onProgress) =>
            executeLocalCopilotTool(call.name, parsedArgs, { ...params.toolCtx, onProgress }),
        })

        let next = await toolStatus.next()
        while (!next.done) {
          events.push(next.value)
          next = await toolStatus.next()
        }
        const toolResult = next.value

        if (toolResult.createdWorkflowId) {
          params.toolCtx.workflowId = toolResult.createdWorkflowId
          const refreshed = await refreshToolContext(params.toolCtx)
          params.toolCtx.structuredContext = refreshed.structuredContext
        } else if (call.name === 'edit_workflow' && toolResult.success) {
          const refreshed = await refreshToolContext(params.toolCtx)
          params.toolCtx.structuredContext = refreshed.structuredContext
        }

        const llmPayload = formatToolResultForLlm(call.name, toolResult.result ?? toolResult.error)
        findings.push(truncate(`[${call.name}] ${llmPayload}`, 4_000))
        messages.push({ role: 'tool', toolCallId: call.id, content: llmPayload })
        events.push({
          type: 'tool_call_result',
          toolCallId: call.id,
          toolName: call.name,
          success: toolResult.success,
          output: toolResult.result,
          ...(toolResult.error ? { error: toolResult.error } : {}),
          ...(toolResult.resources?.length ? { resources: toolResult.resources } : {}),
        })
      }
    }

    return {
      domain: params.domain,
      findings: truncate(findings.filter(Boolean).join('\n\n'), SPECIALIST_FINDINGS_MAX_CHARS),
      toolRoundCount,
      events,
      success: true,
      depth: entered.depth,
    }
  } catch (error) {
    const message = getErrorMessage(error, 'specialist failed')
    logger.warn('Specialist loop failed', { domain: params.domain, error: message })
    return {
      domain: params.domain,
      findings: `Specialist (${params.domain}) failed: ${message}`,
      toolRoundCount: 0,
      events: [...events, { type: 'status', message: `${params.domain} specialist failed` }],
      success: false,
      error: message,
      depth: entered.depth,
    }
  } finally {
    clear()
    entered.release()
  }
}

export async function* runSpecialistPass(
  params: RunSpecialistPassParams
): AsyncGenerator<LocalCopilotStreamEvent, SpecialistPassResult> {
  const result = await executeSpecialistLoop(params)
  for (const event of result.events) yield event
  return result
}
