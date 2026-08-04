import { appendFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RunResult } from '@ai-hero/sandcastle'
import { ensureLedgerRunDir, ledgerRunDir } from './config'

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
  // GPT-5.6 Luna (must precede generic /gpt/ match)
  {
    match: /luna/i,
    pricing: {
      inputPerMTok: 0.2,
      outputPerMTok: 1.2,
      cacheReadPerMTok: 0.02,
      cacheWritePerMTok: 0.25,
    },
  },
  {
    match: /terra/i,
    pricing: {
      inputPerMTok: 2,
      outputPerMTok: 12,
      cacheReadPerMTok: 0.2,
      cacheWritePerMTok: 2.5,
    },
  },
  {
    match: /sol|gpt-5\.6(?!-luna|-terra)|gpt-5\.5|gpt/i,
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

function tokenTotal(tokens: {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}): number {
  return (
    tokens.inputTokens +
    tokens.outputTokens +
    tokens.cacheReadInputTokens +
    tokens.cacheCreationInputTokens
  )
}

function resolveCost(
  model: string,
  providerCost: number | null,
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens: number
    cacheCreationInputTokens: number
  }
): { estimatedCostUsd: number | null; costSource: CostSource } {
  if (providerCost !== null) {
    return { estimatedCostUsd: providerCost, costSource: 'provider' }
  }

  if (tokenTotal(tokens) <= 0) {
    return { estimatedCostUsd: null, costSource: 'unavailable' }
  }

  return {
    estimatedCostUsd: estimateCostFromTokens(model, tokens),
    costSource: 'estimated',
  }
}

interface StreamTokenTotals {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

interface SessionUsageAccumulator {
  costUsd: number | null
  tokens: StreamTokenTotals | null
  tokenScore: number
}

function emptyTokenTotals(): StreamTokenTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  }
}

function readUsageObject(value: unknown): StreamTokenTotals | null {
  if (!value || typeof value !== 'object') return null
  const u = value as Record<string, unknown>
  const inputTokens = u.input_tokens ?? u.inputTokens
  const outputTokens = u.output_tokens ?? u.outputTokens
  const cacheRead = u.cache_read_input_tokens ?? u.cacheReadInputTokens
  const cacheCreate = u.cache_creation_input_tokens ?? u.cacheCreationInputTokens
  if (
    typeof inputTokens !== 'number' ||
    typeof outputTokens !== 'number' ||
    typeof cacheRead !== 'number' ||
    typeof cacheCreate !== 'number'
  ) {
    return null
  }
  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens: cacheRead,
    cacheCreationInputTokens: cacheCreate,
  }
}

export interface ParsedStreamUsage {
  costUsd: number | null
  tokens: StreamTokenTotals
}

/**
 * Parse Claude Code stream-json / session NDJSON for provider cost + token totals.
 *
 * Claude emits many intermediate `type:"result"` events; `total_cost_usd` is
 * session-cumulative. We take the max cost (and best token footprint) per
 * `session_id`, then sum across sessions so multi-iteration Sandcastle runs
 * are not under-counted.
 */
export function parseUsageFromClaudeStream(ndjson: string): ParsedStreamUsage | null {
  if (!ndjson.trim()) return null

  const bySession = new Map<string, SessionUsageAccumulator>()

  for (const rawLine of ndjson.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line.startsWith('{')) continue
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    if (obj.type !== 'result') continue

    const sid =
      typeof obj.session_id === 'string' && obj.session_id.length > 0
        ? obj.session_id
        : '__anon__'

    const prev = bySession.get(sid) ?? { costUsd: null, tokens: null, tokenScore: -1 }

    const costRaw = obj.total_cost_usd
    if (typeof costRaw === 'number' && Number.isFinite(costRaw)) {
      if (prev.costUsd === null || costRaw > prev.costUsd) {
        prev.costUsd = costRaw
      }
    }

    const tokens = readUsageObject(obj.usage)
    if (tokens) {
      const score = tokenTotal(tokens)
      if (score >= prev.tokenScore) {
        prev.tokens = tokens
        prev.tokenScore = score
      }
    }

    bySession.set(sid, prev)
  }

  if (bySession.size === 0) return null

  const tokens = emptyTokenTotals()
  let costUsd: number | null = null
  let sawCost = false
  let sawTokens = false

  for (const session of bySession.values()) {
    if (session.costUsd !== null) {
      costUsd = (costUsd ?? 0) + session.costUsd
      sawCost = true
    }
    if (session.tokens) {
      tokens.inputTokens += session.tokens.inputTokens
      tokens.outputTokens += session.tokens.outputTokens
      tokens.cacheReadInputTokens += session.tokens.cacheReadInputTokens
      tokens.cacheCreationInputTokens += session.tokens.cacheCreationInputTokens
      sawTokens = true
    }
  }

  if (!sawCost && !sawTokens) return null
  return { costUsd: sawCost ? costUsd : null, tokens }
}

/**
 * Map Codex usage objects to Sandcastle-style counters.
 * Codex reports `input_tokens` inclusive of cache hits; billable input is the non-cached share.
 */
function readCodexUsageObject(value: unknown): StreamTokenTotals | null {
  if (!value || typeof value !== 'object') return null
  const u = value as Record<string, unknown>
  const inputRaw = u.input_tokens ?? u.inputTokens
  const outputRaw = u.output_tokens ?? u.outputTokens
  const cachedRaw =
    u.cached_input_tokens ?? u.cache_read_input_tokens ?? u.cacheReadInputTokens ?? 0
  if (typeof inputRaw !== 'number' || typeof outputRaw !== 'number') return null
  if (typeof cachedRaw !== 'number') return null
  const cached = Math.max(0, Math.min(cachedRaw, inputRaw))
  return {
    inputTokens: Math.max(0, inputRaw - cached),
    outputTokens: outputRaw,
    cacheReadInputTokens: cached,
    cacheCreationInputTokens: 0,
  }
}

/**
 * Parse Codex `codex exec --json` NDJSON for token totals.
 *
 * Codex does not emit USD in the stream — callers estimate via {@link estimateCostFromTokens}.
 * Prefer the largest `turn.completed` usage footprint (session-cumulative), matching
 * Sandcastle's last-wins behavior without double-counting turns.
 */
export function parseUsageFromCodexStream(ndjson: string): ParsedStreamUsage | null {
  if (!ndjson.trim()) return null

  let best: StreamTokenTotals | null = null
  let bestScore = -1

  for (const rawLine of ndjson.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line.startsWith('{')) continue
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    let candidate: StreamTokenTotals | null = null

    if (obj.type === 'turn.completed') {
      candidate = readCodexUsageObject(obj.usage)
    } else if (obj.type === 'event_msg' && obj.payload && typeof obj.payload === 'object') {
      const payload = obj.payload as Record<string, unknown>
      if (payload.type === 'token_count' && payload.info && typeof payload.info === 'object') {
        const info = payload.info as Record<string, unknown>
        candidate =
          readCodexUsageObject(info.total_token_usage) ??
          readCodexUsageObject(info.last_token_usage)
      }
    } else if (obj.type === 'token_count') {
      // Some wrappers flatten the event_msg envelope.
      const info =
        obj.info && typeof obj.info === 'object' ? (obj.info as Record<string, unknown>) : null
      if (info) {
        candidate =
          readCodexUsageObject(info.total_token_usage) ??
          readCodexUsageObject(info.last_token_usage)
      }
    }

    if (!candidate) continue
    const score = tokenTotal(candidate)
    if (score >= bestScore) {
      best = candidate
      bestScore = score
    }
  }

  if (!best || bestScore <= 0) return null
  return { costUsd: null, tokens: best }
}

/**
 * Parse Claude and/or Codex agent stream NDJSON. Claude provider cost wins when present;
 * otherwise tokens alone are returned for estimated pricing (typical for Codex/Luna).
 */
export function parseUsageFromAgentStream(ndjson: string): ParsedStreamUsage | null {
  const claude = parseUsageFromClaudeStream(ndjson)
  const codex = parseUsageFromCodexStream(ndjson)

  if (!claude && !codex) return null
  if (claude && !codex) return claude
  if (codex && !claude) return codex

  // Prefer the larger token footprint; keep Claude provider USD when available.
  const claudeScore = tokenTotal(claude!.tokens)
  const codexScore = tokenTotal(codex!.tokens)
  const tokens = codexScore > claudeScore ? codex!.tokens : claude!.tokens
  return {
    costUsd: claude!.costUsd,
    tokens,
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

/**
 * Record token/cost usage for one agent run.
 *
 * Works when Sandcastle returns a normal `RunResult`, and also when the run
 * errors or is cancelled mid-flight — as long as Claude stream-json NDJSON was
 * captured (in-memory lines or a verbose log file). Returns null only when
 * neither iterations nor stream NDJSON contain usage.
 */
export function recordAgentUsage(
  agentName: string,
  model: string,
  result: RunResult | null | undefined,
  /** Raw Claude/Codex NDJSON captured from the agent stream (preferred over text-only stdout). */
  streamNdjson?: string
): AgentUsageRecord | null {
  const fromIterations = (result?.iterations ?? []).reduce(
    (acc, iteration) => {
      if (!iteration.usage) return acc
      acc.inputTokens += iteration.usage.inputTokens ?? 0
      acc.outputTokens += iteration.usage.outputTokens ?? 0
      acc.cacheReadInputTokens += iteration.usage.cacheReadInputTokens ?? 0
      acc.cacheCreationInputTokens += iteration.usage.cacheCreationInputTokens ?? 0
      return acc
    },
    emptyTokenTotals()
  )

  // Sandcastle's Claude parser does not emit usage events and `result.stdout` is
  // agent text only — fall back to raw stream-json NDJSON when iteration usage
  // is missing or under-counts (session parse often keeps only the last turn).
  // Codex children emit `turn.completed` usage (no USD) — estimate via price table.
  // On cancel/error, `result` is often null but stream NDJSON still has tokens/cost.
  const fromStream = parseUsageFromAgentStream(streamNdjson ?? result?.stdout ?? '')
  const streamTokens = fromStream?.tokens
  const hasStreamUsage =
    fromStream !== null &&
    (tokenTotal(fromStream.tokens) > 0 || fromStream.costUsd !== null)
  const hasIterationUsage = tokenTotal(fromIterations) > 0

  if (!hasStreamUsage && !hasIterationUsage) return null

  const totals =
    streamTokens && tokenTotal(streamTokens) > tokenTotal(fromIterations)
      ? streamTokens
      : fromIterations

  const cost = resolveCost(model, fromStream?.costUsd ?? null, totals)
  const iterationCount = result?.iterations?.length ?? 0
  const record: AgentUsageRecord = {
    agentName,
    model,
    // Cancelled/errored runs may have stream usage with no completed iterations.
    iterations: iterationCount > 0 ? iterationCount : hasStreamUsage ? 1 : 0,
    ...totals,
    estimatedCostUsd: cost.estimatedCostUsd,
    costSource: cost.costSource,
  }
  upsertUsageRecord(record)
  logUsageRecord(record)
  return record
}

function upsertUsageRecord(record: AgentUsageRecord): void {
  const existingIdx = usageRecords.findIndex((r) => r.agentName === record.agentName)
  if (existingIdx >= 0) {
    const existing = usageRecords[existingIdx]
    // Prefer the larger token footprint (cancel flush vs later recover, etc.).
    if (tokenTotal(record) >= tokenTotal(existing)) {
      usageRecords[existingIdx] = record
    }
    return
  }
  usageRecords.push(record)
}

/** Infer parent vs child model defaults from an agent / log basename. */
export function inferModelForAgentName(agentName: string): string {
  const mode = (process.env.UPSTREAM_SYNC_AGENT ?? 'dual').toLowerCase()
  const isParent = agentName.startsWith('parent') || agentName.includes('grill')

  if (mode === 'openai') {
    return (
      process.env.UPSTREAM_SYNC_OPENAI_CHILD_MODEL ??
      process.env.UPSTREAM_SYNC_OPENAI_MODEL ??
      'gpt-5.6-luna'
    )
  }

  if (isParent) {
    return process.env.UPSTREAM_SYNC_ANTHROPIC_PARENT_MODEL ?? 'claude-opus-5'
  }

  if (mode === 'anthropic') {
    return process.env.UPSTREAM_SYNC_ANTHROPIC_CHILD_MODEL ?? 'claude-sonnet-5'
  }

  // dual (default): Luna children
  return (
    process.env.UPSTREAM_SYNC_OPENAI_CHILD_MODEL ??
    process.env.UPSTREAM_SYNC_OPENAI_MODEL ??
    'gpt-5.6-luna'
  )
}

/**
 * Rebuild usage records from Sandcastle verbose log files under `.sandcastle/logs/`.
 * Used when the harness process is killed (workflow cancel / runner SIGKILL) before
 * in-memory records can be persisted.
 */
export function recoverUsageFromLogDir(
  logDir: string,
  options?: { agentNameFromFile?: (fileName: string) => string }
): AgentUsageRecord[] {
  let entries: string[]
  try {
    entries = readdirSync(logDir).filter((name) => name.endsWith('.log'))
  } catch {
    return []
  }

  const recovered: AgentUsageRecord[] = []
  for (const fileName of entries) {
    const agentName =
      options?.agentNameFromFile?.(fileName) ?? fileName.replace(/\.log$/i, '')
    let contents: string
    try {
      contents = readFileSync(join(logDir, fileName), 'utf8')
    } catch {
      continue
    }
    const record = recordAgentUsage(
      agentName,
      inferModelForAgentName(agentName),
      null,
      contents
    )
    if (record) recovered.push(record)
  }
  return recovered
}

export function getUsageRecords(): readonly AgentUsageRecord[] {
  return usageRecords
}

/** Sum USD across records that have a numeric cost (provider or estimated). */
export function sumUsageCostUsd(records: readonly AgentUsageRecord[]): number | null {
  let total = 0
  let saw = false
  for (const record of records) {
    if (record.estimatedCostUsd === null) continue
    total += record.estimatedCostUsd
    saw = true
  }
  return saw ? Number(total.toFixed(6)) : null
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
  const runTotal = sumUsageCostUsd(records)

  const lines: string[] = []
  // Always lead with a single run total so dual (provider Opus + estimated Luna) is obvious.
  lines.push(
    runTotal === null
      ? '- **Total cost:** unavailable'
      : `- **Total cost:** $${runTotal.toFixed(6)}`
  )
  if (hasProvider) {
    lines.push(`- **Provider-reported cost:** $${providerTotal.toFixed(6)}`)
  }
  if (hasEstimated) {
    lines.push(`- **Estimated cost (fallback):** $${estimatedTotal.toFixed(6)}`)
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

  const runTotal = sumUsageCostUsd(records)
  const providerTotal = records
    .filter((r) => r.costSource === 'provider' && r.estimatedCostUsd !== null)
    .reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0)
  const estimatedTotal = records
    .filter((r) => r.costSource === 'estimated' && r.estimatedCostUsd !== null)
    .reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0)
  const totalLabel = runTotal === null ? 'unavailable' : `$${runTotal.toFixed(4)}`
  const breakdown: string[] = []
  if (providerTotal > 0) breakdown.push(`provider $${providerTotal.toFixed(4)}`)
  if (estimatedTotal > 0) breakdown.push(`estimated $${estimatedTotal.toFixed(4)}`)

  return [
    '## Agent usage',
    '',
    '| Agent | Model | Input tokens | Output tokens | Cost | Source |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...rows,
    '',
    `**Total cost:** ${totalLabel}`,
    ...(breakdown.length > 1 ? [`**Cost breakdown:** ${breakdown.join(' + ')}`] : []),
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
 * Force-publish agent usage into the Actions job summary.
 * Safe to call from a post-job step even when the harness already tried —
 * each Actions step gets its own summary file that rolls up into the job.
 */
export function publishUsageJobSummary(
  records: readonly AgentUsageRecord[] = usageRecords
): boolean {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) {
    console.log('[usage] GITHUB_STEP_SUMMARY unset — skipping job summary')
    return false
  }
  appendFileSync(summaryPath, `\n${formatUsageStepSummary(records)}\n`)
  stepSummaryWritten = true
  console.log(
    records.length === 0
      ? '[usage] published empty agent usage section to job summary'
      : `[usage] published ${records.length} agent(s) to job summary`
  )
  return true
}

/**
 * Write ledger `usage.json` and (once) the Actions step summary.
 * Returns the PR/run-log markdown section.
 *
 * In GitHub Actions, the job Summary tab is owned by the dedicated
 * `Publish agent usage summary` always() step (`recover-usage.ts`) so cancelled
 * runs still get a table. Locally we still write `$GITHUB_STEP_SUMMARY` if set.
 */
export function persistUsageArtifacts(runId: string): string {
  const records = getUsageRecords()
  const markdown = formatUsageMarkdown(records)
  writeUsageJson(runId, records)
  if (process.env.GITHUB_ACTIONS !== 'true') {
    appendUsageStepSummary(records)
  }
  return markdown
}

/** Load previously written ledger usage.json into the in-memory record list. */
export function loadUsageRecordsFromJson(runId: string): AgentUsageRecord[] {
  const path = join(ledgerRunDir(runId), 'usage.json')
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []
  const agents = (parsed as { agents?: unknown }).agents
  if (!Array.isArray(agents)) return []

  const loaded: AgentUsageRecord[] = []
  for (const entry of agents) {
    if (!entry || typeof entry !== 'object') continue
    const r = entry as Partial<AgentUsageRecord>
    if (typeof r.agentName !== 'string' || typeof r.model !== 'string') continue
    const record: AgentUsageRecord = {
      agentName: r.agentName,
      model: r.model,
      iterations: typeof r.iterations === 'number' ? r.iterations : 0,
      inputTokens: typeof r.inputTokens === 'number' ? r.inputTokens : 0,
      outputTokens: typeof r.outputTokens === 'number' ? r.outputTokens : 0,
      cacheReadInputTokens:
        typeof r.cacheReadInputTokens === 'number' ? r.cacheReadInputTokens : 0,
      cacheCreationInputTokens:
        typeof r.cacheCreationInputTokens === 'number' ? r.cacheCreationInputTokens : 0,
      estimatedCostUsd:
        typeof r.estimatedCostUsd === 'number'
          ? r.estimatedCostUsd
          : r.estimatedCostUsd === null
            ? null
            : null,
      costSource:
        r.costSource === 'provider' || r.costSource === 'estimated' || r.costSource === 'unavailable'
          ? r.costSource
          : 'unavailable',
    }
    upsertUsageRecord(record)
    loaded.push(record)
  }
  return loaded
}

/**
 * Best-effort parse of provider USD from agent stdout/NDJSON (Claude only —
 * Codex streams have tokens but no USD).
 */
export function parseCostFromStdout(stdout: string): number | null {
  return parseUsageFromAgentStream(stdout)?.costUsd ?? null
}
