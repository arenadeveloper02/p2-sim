import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RunResult } from '@ai-hero/sandcastle'
import { ensureLedgerRunDir } from './config'

/** Where the USD figure on a usage record came from. */
export type CostSource = 'provider' | 'estimated' | 'unavailable'

export interface AgentUsageRecord {
  agentName: string
  model: string
  iterations: number
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  estimatedCostUsd: number | null
  costSource: CostSource
}

/** USD per million tokens for static estimate fallback. */
export interface ModelTokenPricing {
  inputPerMTok: number
  outputPerMTok: number
  cacheReadPerMTok: number
  cacheWritePerMTok: number
}

/**
 * Static list prices for harness defaults (Opus parent / Sonnet child / GPT via Codex).
 * Used only when provider stdout does not include `total_cost_usd`.
 */
const MODEL_PRICING: Array<{ match: RegExp; pricing: ModelTokenPricing }> = [
  {
    match: /opus/i,
    pricing: {
      inputPerMTok: 5,
      outputPerMTok: 25,
      cacheReadPerMTok: 0.5,
      cacheWritePerMTok: 6.25,
    },
  },
  {
    match: /sonnet/i,
    pricing: {
      inputPerMTok: 3,
      outputPerMTok: 15,
      cacheReadPerMTok: 0.3,
      cacheWritePerMTok: 3.75,
    },
  },
  {
    match: /haiku/i,
    pricing: {
      inputPerMTok: 1,
      outputPerMTok: 5,
      cacheReadPerMTok: 0.1,
      cacheWritePerMTok: 1.25,
    },
  },
  {
    match: /gpt/i,
    pricing: {
      inputPerMTok: 5,
      outputPerMTok: 30,
      cacheReadPerMTok: 0.5,
      cacheWritePerMTok: 5,
    },
  },
]

/** Mid-tier default when the model id does not match a known family. */
const DEFAULT_PRICING: ModelTokenPricing = {
  inputPerMTok: 3,
  outputPerMTok: 15,
  cacheReadPerMTok: 0.3,
  cacheWritePerMTok: 3.75,
}

const usageRecords: AgentUsageRecord[] = []
let stepSummaryWritten = false

export function resetUsageRecords(): void {
  usageRecords.length = 0
  stepSummaryWritten = false
}

export function resolveModelPricing(model: string): ModelTokenPricing {
  for (const entry of MODEL_PRICING) {
    if (entry.match.test(model)) return entry.pricing
  }
  return DEFAULT_PRICING
}

/**
 * Estimate USD from token counters and a model id using the static price table.
 */
export function estimateCostFromTokens(
  model: string,
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens: number
    cacheCreationInputTokens: number
  }
): number {
  const pricing = resolveModelPricing(model)
  const usd =
    (tokens.inputTokens * pricing.inputPerMTok +
      tokens.outputTokens * pricing.outputPerMTok +
      tokens.cacheReadInputTokens * pricing.cacheReadPerMTok +
      tokens.cacheCreationInputTokens * pricing.cacheWritePerMTok) /
    1_000_000
  return Number(usd.toFixed(6))
}

function totalInputTokens(record: Pick<
  AgentUsageRecord,
  'inputTokens' | 'cacheReadInputTokens' | 'cacheCreationInputTokens'
>): number {
  return record.inputTokens + record.cacheReadInputTokens + record.cacheCreationInputTokens
}

function resolveCost(
  model: string,
  stdout: string,
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens: number
    cacheCreationInputTokens: number
  }
): { estimatedCostUsd: number | null; costSource: CostSource } {
  const providerCost = parseCostFromStdout(stdout)
  if (providerCost !== null) {
    return { estimatedCostUsd: providerCost, costSource: 'provider' }
  }

  const tokenTotal =
    tokens.inputTokens +
    tokens.outputTokens +
    tokens.cacheReadInputTokens +
    tokens.cacheCreationInputTokens
  if (tokenTotal <= 0) {
    return { estimatedCostUsd: null, costSource: 'unavailable' }
  }

  return {
    estimatedCostUsd: estimateCostFromTokens(model, tokens),
    costSource: 'estimated',
  }
}

function formatCostLabel(costUsd: number | null, source: CostSource): string {
  if (source === 'unavailable' || costUsd === null) {
    return 'unavailable'
  }
  const amount = `$${costUsd.toFixed(6)}`
  if (source === 'provider') return `${amount} (provider-reported)`
  return `${amount} (estimated fallback)`
}

function logUsageRecord(record: AgentUsageRecord): void {
  const totalInput = totalInputTokens(record)
  const cost =
    record.estimatedCostUsd === null ? 'unavailable' : `$${record.estimatedCostUsd.toFixed(6)}`
  console.log(
    `[usage] ${record.agentName}: tokens in=${totalInput} out=${record.outputTokens} cost=${cost} source=${record.costSource}`
  )
}

export function recordAgentUsage(
  agentName: string,
  model: string,
  result: RunResult | null | undefined
): AgentUsageRecord | null {
  if (!result?.iterations?.length) return null

  const totals = result.iterations.reduce(
    (acc, iteration) => {
      if (!iteration.usage) return acc
      acc.inputTokens += iteration.usage.inputTokens ?? 0
      acc.outputTokens += iteration.usage.outputTokens ?? 0
      acc.cacheReadInputTokens += iteration.usage.cacheReadInputTokens ?? 0
      acc.cacheCreationInputTokens += iteration.usage.cacheCreationInputTokens ?? 0
      return acc
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    }
  )

  const cost = resolveCost(model, result.stdout ?? '', totals)
  const record: AgentUsageRecord = {
    agentName,
    model,
    iterations: result.iterations.length,
    ...totals,
    estimatedCostUsd: cost.estimatedCostUsd,
    costSource: cost.costSource,
  }
  usageRecords.push(record)
  logUsageRecord(record)
  return record
}

export function getUsageRecords(): readonly AgentUsageRecord[] {
  return usageRecords
}

function formatTotalsCostLines(records: readonly AgentUsageRecord[]): string[] {
  const providerTotal = records
    .filter((r) => r.costSource === 'provider' && r.estimatedCostUsd !== null)
    .reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0)
  const estimatedTotal = records
    .filter((r) => r.costSource === 'estimated' && r.estimatedCostUsd !== null)
    .reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0)
  const hasProvider = records.some((r) => r.costSource === 'provider')
  const hasEstimated = records.some((r) => r.costSource === 'estimated')
  const allUnavailable = records.every((r) => r.costSource === 'unavailable')

  const lines: string[] = []
  if (hasProvider) {
    lines.push(`- **Provider-reported cost:** $${providerTotal.toFixed(6)}`)
  }
  if (hasEstimated) {
    lines.push(`- **Estimated cost (fallback):** $${estimatedTotal.toFixed(6)}`)
  }
  if (allUnavailable || (!hasProvider && !hasEstimated)) {
    lines.push('- **Total cost:** unavailable')
  } else if (hasProvider && hasEstimated) {
    lines.push(`- **Combined cost:** $${(providerTotal + estimatedTotal).toFixed(6)}`)
  }
  return lines
}

export function formatUsageMarkdown(records: readonly AgentUsageRecord[]): string {
  if (records.length === 0) {
    return '_No agent usage captured (agents skipped or provider did not report tokens)._'
  }

  const lines = records.map((record) => {
    const directInput = record.inputTokens
    const totalInput = totalInputTokens(record)
    return [
      `### ${record.agentName}`,
      `- **Model:** \`${record.model}\``,
      `- **Iterations:** ${record.iterations}`,
      `- **Input tokens (direct):** ${directInput.toLocaleString()}`,
      `- **Input tokens (cache read):** ${record.cacheReadInputTokens.toLocaleString()}`,
      `- **Input tokens (cache create):** ${record.cacheCreationInputTokens.toLocaleString()}`,
      `- **Input tokens (total):** ${totalInput.toLocaleString()}`,
      `- **Output tokens:** ${record.outputTokens.toLocaleString()}`,
      `- **Cost:** ${formatCostLabel(record.estimatedCostUsd, record.costSource)}`,
    ].join('\n')
  })

  const costLines = records.map(
    (record) =>
      `- **${record.agentName}:** ${formatCostLabel(record.estimatedCostUsd, record.costSource)}`
  )

  const grandTotal = records.reduce(
    (acc, record) => {
      acc.input += totalInputTokens(record)
      acc.output += record.outputTokens
      return acc
    },
    { input: 0, output: 0 }
  )

  return [
    ...lines,
    '',
    '### Totals',
    `- **Total input tokens:** ${grandTotal.input.toLocaleString()}`,
    `- **Total output tokens:** ${grandTotal.output.toLocaleString()}`,
    `- **Primary models:** ${[...new Set(records.map((r) => r.model))].join(', ')}`,
    ...formatTotalsCostLines(records),
    '',
    '### Cost by agent',
    ...costLines,
  ].join('\n')
}

/** Compact markdown table for GitHub Actions job summaries. */
export function formatUsageStepSummary(records: readonly AgentUsageRecord[]): string {
  if (records.length === 0) {
    return ['## Agent usage', '', '_No agent usage captured._'].join('\n')
  }

  const rows = records.map((record) => {
    const cost =
      record.estimatedCostUsd === null ? 'unavailable' : `$${record.estimatedCostUsd.toFixed(4)}`
    return `| ${record.agentName} | \`${record.model}\` | ${totalInputTokens(record).toLocaleString()} | ${record.outputTokens.toLocaleString()} | ${cost} | ${record.costSource} |`
  })

  const providerTotal = records
    .filter((r) => r.costSource === 'provider')
    .reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0)
  const estimatedTotal = records
    .filter((r) => r.costSource === 'estimated')
    .reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0)
  const hasAnyCost = records.some((r) => r.estimatedCostUsd !== null)
  const totalLabel = hasAnyCost
    ? `$${(providerTotal + estimatedTotal).toFixed(4)}`
    : 'unavailable'

  return [
    '## Agent usage',
    '',
    '| Agent | Model | Input tokens | Output tokens | Cost | Source |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...rows,
    '',
    `**Total cost:** ${totalLabel}`,
  ].join('\n')
}

/** Persist structured usage under the run ledger directory. */
export function writeUsageJson(runId: string, records: readonly AgentUsageRecord[] = usageRecords): string {
  const dir = ensureLedgerRunDir(runId)
  const path = join(dir, 'usage.json')
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        runId,
        recordedAt: new Date().toISOString(),
        agents: records,
      },
      null,
      2
    )}\n`
  )
  return path
}

/** Append a compact usage table to `$GITHUB_STEP_SUMMARY` once per process. */
export function appendUsageStepSummary(
  records: readonly AgentUsageRecord[] = usageRecords
): boolean {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath || stepSummaryWritten) return false
  appendFileSync(summaryPath, `\n${formatUsageStepSummary(records)}\n`)
  stepSummaryWritten = true
  return true
}

/**
 * Write ledger `usage.json` and (once) the Actions step summary.
 * Returns the PR/run-log markdown section.
 */
export function persistUsageArtifacts(runId: string): string {
  const records = getUsageRecords()
  const markdown = formatUsageMarkdown(records)
  writeUsageJson(runId, records)
  appendUsageStepSummary(records)
  return markdown
}

/** Best-effort parse of Claude Code cost JSON embedded in agent stdout. */
export function parseCostFromStdout(stdout: string): number | null {
  const match = stdout.match(/"total_cost_usd"\s*:\s*([0-9.]+)/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}
