import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'
import { truncate } from '@sim/utils/string'
import type { SpecialistBudget } from '@/local-copilot/lib/agent/specialists/budget'
import {
  isSpecialistDomain,
  MAX_PARALLEL_SUBAGENTS,
  type LocalCopilotCloudSpecialistDomain,
} from '@/local-copilot/lib/agent/specialists/domains'
import {
  SPECIALIST_FINDINGS_MAX_CHARS,
  executeSpecialistLoop,
  type RunSpecialistPassParams,
  type SpecialistPassResult,
} from '@/local-copilot/lib/agent/specialists/specialist-pass'
import { resolveSpecialistBrief } from '@/local-copilot/lib/agent/specialists/specialist-tools'
import { getLocalCopilotMemorySnapshot } from '@/local-copilot/lib/diagnostics'
import type { LocalCopilotStreamEvent } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotParentSpecialistCalls')

export interface PendingSpecialistToolCall {
  id: string
  name: string
  arguments: string
}

export interface RunParentSpecialistCallsParams
  extends Omit<RunSpecialistPassParams, 'domain' | 'userMessage' | 'parentDepth'> {
  calls: PendingSpecialistToolCall[]
  lastUserMessage: string
  budget: SpecialistBudget
  parentDepth?: number
}

export interface ParentSpecialistCallOutcome {
  toolCallId: string
  toolName: string
  domain: LocalCopilotCloudSpecialistDomain | null
  success: boolean
  findings: string
  error?: string
  result: SpecialistPassResult | null
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function* runParentSpecialistToolCalls(
  params: RunParentSpecialistCallsParams
): AsyncGenerator<LocalCopilotStreamEvent, ParentSpecialistCallOutcome[]> {
  const parentDepth = params.parentDepth ?? 0
  const outcomes: ParentSpecialistCallOutcome[] = []
  const batches = chunkArray(params.calls, MAX_PARALLEL_SUBAGENTS)

  for (const batch of batches) {
    if (batch.length > 1) {
      yield {
        type: 'status',
        message: `Running ${batch.length} specialists in parallel (${batch.map((c) => c.name).join(', ')})…`,
      }
    }

    logger.info('Arena Copilot specialist batch starting', {
      domains: batch.map((call) => call.name),
      budget: params.budget.snapshot(),
      memory: getLocalCopilotMemorySnapshot(),
    })

    const settled = await Promise.all(
      batch.map(async (call) => {
        const parsedArgs = parseToolArgs(call.arguments)
        if (!isSpecialistDomain(call.name)) {
          return {
            call,
            parsedArgs,
            result: {
              domain: 'workflow' as const,
              findings: '',
              toolRoundCount: 0,
              events: [
                { type: 'status' as const, message: `Unknown specialist tool: ${call.name}` },
              ],
              success: false,
              error: `Unknown specialist tool: ${call.name}`,
            } satisfies SpecialistPassResult,
            error: `Unknown specialist tool: ${call.name}`,
          }
        }

        try {
          const result = await executeSpecialistLoop({
            ...params,
            domain: call.name,
            userMessage: resolveSpecialistBrief(call.name, parsedArgs, params.lastUserMessage),
            parentDepth,
          })
          return {
            call,
            parsedArgs,
            result,
            error: result.success ? undefined : (result.error ?? result.findings),
          }
        } catch (error) {
          const message = getErrorMessage(error, 'specialist failed')
          logger.warn('Parent specialist call failed', {
            domain: call.name,
            toolCallId: call.id,
            error: message,
          })
          return {
            call,
            parsedArgs,
            result: {
              domain: call.name,
              findings: `Specialist (${call.name}) failed: ${message}`,
              toolRoundCount: 0,
              events: [{ type: 'status' as const, message: `${call.name} specialist failed` }],
              success: false,
              error: message,
            } satisfies SpecialistPassResult,
            error: message,
          }
        }
      })
    )

    for (const item of settled) {
      yield {
        type: 'tool_call_start',
        toolCallId: item.call.id,
        toolName: item.call.name,
        args: item.parsedArgs,
      }
      for (const event of item.result.events) yield event

      const findings = truncate(
        item.result.findings.trim() ||
          (item.error ? item.error : `Specialist (${item.call.name}) completed with no findings.`),
        SPECIALIST_FINDINGS_MAX_CHARS
      )

      const outcome: ParentSpecialistCallOutcome = {
        toolCallId: item.call.id,
        toolName: item.call.name,
        domain: isSpecialistDomain(item.call.name) ? item.call.name : null,
        success: item.result.success && !item.error,
        findings,
        ...(item.error ? { error: item.error } : {}),
        result: item.result,
      }
      outcomes.push(outcome)

      yield {
        type: 'tool_call_result',
        toolCallId: item.call.id,
        toolName: item.call.name,
        success: outcome.success,
        output: {
          success: outcome.success,
          message: findings,
          domain: item.call.name,
          toolRoundCount: item.result.toolRoundCount,
        },
        ...(outcome.error ? { error: outcome.error } : {}),
      }
    }

    await sleep(0)
  }

  logger.info('Arena Copilot specialist calls complete', {
    callCount: outcomes.length,
    domains: outcomes.map((outcome) => outcome.toolName),
    budget: params.budget.snapshot(),
    memory: getLocalCopilotMemorySnapshot(),
  })

  return outcomes
}
