import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'
import { truncate } from '@sim/utils/string'
import { MAX_PARALLEL_SUBAGENTS } from '@/local-copilot/lib/agent/specialists/classify'
import type { LocalCopilotSpecialistDomain } from '@/local-copilot/lib/agent/specialists/domains'
import {
  SPECIALIST_FINDINGS_MAX_CHARS,
  executeSpecialistLoop,
  type RunSpecialistPassParams,
  type SpecialistPassResult,
} from '@/local-copilot/lib/agent/specialists/specialist-pass'
import { getLocalCopilotMemorySnapshot } from '@/local-copilot/lib/diagnostics'
import type { LocalCopilotStreamEvent } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotParallelSubagents')

/** Per-subagent wall-clock budget (parent abort still wins immediately). */
export const PARALLEL_SUBAGENT_TIMEOUT_MS = 90_000

export { MAX_PARALLEL_SUBAGENTS }

export interface RunParallelSubagentsParams extends Omit<RunSpecialistPassParams, 'domain'> {
  domains: Array<Exclude<LocalCopilotSpecialistDomain, 'general'>>
  /** Override default per-agent timeout. */
  timeoutMs?: number
}

export interface ParallelSubagentsResult {
  findings: string
  results: SpecialistPassResult[]
  events: LocalCopilotStreamEvent[]
}

function mergeAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      return controller.signal
    }
    signal.addEventListener(
      'abort',
      () => {
        controller.abort(signal.reason)
      },
      { once: true }
    )
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

  return {
    signal,
    clear: () => clearTimeout(timer),
  }
}

/**
 * Runs up to {@link MAX_PARALLEL_SUBAGENTS} specialist loops concurrently.
 * Child abort is tied to the parent chat signal; each child also has a wall timeout.
 * SSE events are emitted after join, grouped by domain (stable UI order).
 */
export async function* runParallelSubagents(
  params: RunParallelSubagentsParams
): AsyncGenerator<LocalCopilotStreamEvent, ParallelSubagentsResult> {
  const domains = params.domains.slice(0, MAX_PARALLEL_SUBAGENTS)
  if (domains.length === 0) {
    return { findings: '', results: [], events: [] }
  }

  const timeoutMs = params.timeoutMs ?? PARALLEL_SUBAGENT_TIMEOUT_MS

  yield {
    type: 'status',
    message: `Running ${domains.length} specialists in parallel (${domains.join(', ')})…`,
  }

  logger.info('Arena Copilot parallel subagents starting', {
    domains,
    timeoutMs,
    memory: getLocalCopilotMemorySnapshot(),
  })

  const settled = await Promise.all(
    domains.map(async (domain) => {
      const { signal, clear } = await withTimeoutSignal(params.signal, timeoutMs)
      try {
        return await executeSpecialistLoop({
          ...params,
          domain,
          signal,
        })
      } catch (error) {
        logger.warn('Parallel subagent failed', {
          domain,
          error: getErrorMessage(error, 'subagent failed'),
        })
        return {
          domain,
          findings: `Specialist (${domain}) failed: ${getErrorMessage(error, 'unknown error')}`,
          toolRoundCount: 0,
          events: [
            {
              type: 'status',
              message: `${domain} specialist failed`,
            },
          ],
        } satisfies SpecialistPassResult
      } finally {
        clear()
      }
    })
  )

  // Preserve priority order from the domains list (not completion order).
  const byDomain = new Map(
    settled.map((result) => [result.domain as LocalCopilotSpecialistDomain, result])
  )
  const ordered = domains
    .map((domain) => byDomain.get(domain))
    .filter((result): result is SpecialistPassResult => Boolean(result))

  const events: LocalCopilotStreamEvent[] = []
  for (const result of ordered) {
    for (const event of result.events) {
      events.push(event)
      yield event
    }
  }

  const findings = truncate(
    ordered
      .filter((result) => result.findings.trim())
      .map((result) => `### ${result.domain}\n${result.findings}`)
      .join('\n\n'),
    SPECIALIST_FINDINGS_MAX_CHARS
  )

  yield {
    type: 'status',
    message: 'Specialists finished — continuing…',
  }

  logger.info('Arena Copilot parallel subagents complete', {
    domains,
    toolRounds: ordered.map((result) => ({
      domain: result.domain,
      toolRoundCount: result.toolRoundCount,
      findingsChars: result.findings.length,
    })),
    memory: getLocalCopilotMemorySnapshot(),
  })

  // Yield once so the event loop can flush status before the parent continues.
  await sleep(0)

  return { findings, results: ordered, events }
}
