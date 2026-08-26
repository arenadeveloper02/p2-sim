import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'
import { truncate } from '@sim/utils/string'
import type { SpecialistBudget } from '@/local-copilot/lib/agent/specialists/budget'
import {
  isSpecialistDomain,
  type LocalCopilotCloudSpecialistDomain,
  MAX_PARALLEL_SUBAGENTS,
} from '@/local-copilot/lib/agent/specialists/domains'
import {
  executeSpecialistLoop,
  type RunSpecialistPassParams,
  SPECIALIST_FINDINGS_MAX_CHARS,
  type SpecialistPassResult,
} from '@/local-copilot/lib/agent/specialists/specialist-pass'
import { resolveSpecialistBrief } from '@/local-copilot/lib/agent/specialists/specialist-tools'
import { getLocalCopilotMemorySnapshot } from '@/local-copilot/lib/diagnostics'
import type { LocalCopilotStreamEvent } from '@/local-copilot/lib/types'
import { buildSpecialistExecutionBatches } from '@/local-copilot/lib/writes/specialist-scheduling'

const logger = createLogger('LocalCopilotParentSpecialistCalls')

export interface PendingSpecialistToolCall {
  id: string
  name: string
  arguments: string
}

export interface RunParentSpecialistCallsParams
  extends Omit<RunSpecialistPassParams, 'domain' | 'userMessage' | 'parentDepth' | 'onEvent'> {
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

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Runs parent specialist tool calls, streaming nested events (including
 * confirmation prompts) as they happen so Approve UI is not buffered until
 * after the confirmation wait finishes.
 */
export async function* runParentSpecialistToolCalls(
  params: RunParentSpecialistCallsParams
): AsyncGenerator<LocalCopilotStreamEvent, ParentSpecialistCallOutcome[]> {
  const parentDepth = params.parentDepth ?? 0
  const outcomes: ParentSpecialistCallOutcome[] = []
  const batches = buildSpecialistExecutionBatches(params.calls, MAX_PARALLEL_SUBAGENTS)

  for (const batch of batches) {
    if (batch.length > 1) {
      yield { type: 'status', message: 'Working on it…' }
    }

    logger.info('Arena Copilot specialist batch starting', {
      domains: batch.map((call) => call.name),
      budget: params.budget.snapshot(),
      memory: getLocalCopilotMemorySnapshot(),
    })

    const liveEvents: LocalCopilotStreamEvent[] = []
    let wake: (() => void) | undefined
    let remaining = batch.length

    const enqueue = (event: LocalCopilotStreamEvent) => {
      liveEvents.push(event)
      wake?.()
    }

    const taskPromises = batch.map(async (call) => {
      const parsedArgs = parseToolArgs(call.arguments)
      enqueue({
        type: 'tool_call_start',
        toolCallId: call.id,
        toolName: call.name,
        args: parsedArgs,
      })

      if (!isSpecialistDomain(call.name)) {
        remaining -= 1
        wake?.()
        return {
          call,
          parsedArgs,
          result: {
            domain: 'workflow' as const,
            findings: '',
            toolRoundCount: 0,
            events: [{ type: 'status' as const, message: `Unknown specialist tool: ${call.name}` }],
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
          onEvent: enqueue,
        })
        remaining -= 1
        wake?.()
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
        enqueue({ type: 'status', message: `${call.name} specialist failed` })
        remaining -= 1
        wake?.()
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

    const settledPromise = Promise.all(taskPromises)

    while (remaining > 0 || liveEvents.length > 0) {
      if (liveEvents.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
        continue
      }
      yield liveEvents.shift()!
    }

    const settled = await settledPromise

    for (const item of settled) {
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
          ...(item.result.structured ? { structured: item.result.structured } : {}),
          ...(item.result.verifications?.length
            ? { verifications: item.result.verifications }
            : {}),
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
