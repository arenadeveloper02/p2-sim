import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'
import { truncate } from '@sim/utils/string'
import type { SpecialistBudget } from '@/local-copilot/lib/agent/specialists/budget'
import {
  MAX_PARALLEL_SUBAGENTS,
  type LocalCopilotCloudSpecialistDomain,
} from '@/local-copilot/lib/agent/specialists/domains'
import {
  SPECIALIST_FINDINGS_MAX_CHARS,
  executeSpecialistLoop,
  type RunSpecialistPassParams,
  type SpecialistPassResult,
} from '@/local-copilot/lib/agent/specialists/specialist-pass'
import { getLocalCopilotMemorySnapshot } from '@/local-copilot/lib/diagnostics'
import type { LocalCopilotStreamEvent } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotParallelSubagents')

export { MAX_PARALLEL_SUBAGENTS }

export interface RunParallelSubagentsParams
  extends Omit<RunSpecialistPassParams, 'domain' | 'parentDepth'> {
  domains: LocalCopilotCloudSpecialistDomain[]
  budget: SpecialistBudget
  parentDepth?: number
}

export interface ParallelSubagentsResult {
  findings: string
  results: SpecialistPassResult[]
  events: LocalCopilotStreamEvent[]
}

export async function* runParallelSubagents(
  params: RunParallelSubagentsParams
): AsyncGenerator<LocalCopilotStreamEvent, ParallelSubagentsResult> {
  const domains = params.domains.slice(0, MAX_PARALLEL_SUBAGENTS)
  if (domains.length === 0) return { findings: '', results: [], events: [] }

  const parentDepth = params.parentDepth ?? 0

  yield {
    type: 'status',
    message: `Running ${domains.length} specialists in parallel (${domains.join(', ')})…`,
  }

  logger.info('Arena Copilot parallel subagents starting', {
    domains,
    timeoutMs: params.budget.timeoutMs,
    budget: params.budget.snapshot(),
    memory: getLocalCopilotMemorySnapshot(),
  })

  const settled = await Promise.all(
    domains.map(async (domain) => {
      try {
        return await executeSpecialistLoop({ ...params, domain, parentDepth })
      } catch (error) {
        logger.warn('Parallel subagent failed', {
          domain,
          error: getErrorMessage(error, 'subagent failed'),
        })
        return {
          domain,
          findings: `Specialist (${domain}) failed: ${getErrorMessage(error, 'unknown error')}`,
          toolRoundCount: 0,
          events: [{ type: 'status', message: `${domain} specialist failed` }],
          success: false,
          error: getErrorMessage(error, 'subagent failed'),
        } satisfies SpecialistPassResult
      }
    })
  )

  const byDomain = new Map(settled.map((result) => [result.domain, result]))
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

  yield { type: 'status', message: 'Specialists finished — continuing…' }

  logger.info('Arena Copilot parallel subagents complete', {
    domains,
    toolRounds: ordered.map((result) => ({
      domain: result.domain,
      toolRoundCount: result.toolRoundCount,
      findingsChars: result.findings.length,
      success: result.success,
    })),
    budget: params.budget.snapshot(),
    memory: getLocalCopilotMemorySnapshot(),
  })

  await sleep(0)
  return { findings, results: ordered, events }
}
