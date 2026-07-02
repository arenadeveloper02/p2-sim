import type { RunResult } from '@ai-hero/sandcastle'

export interface AgentUsageRecord {
  agentName: string
  model: string
  iterations: number
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  estimatedCostUsd: number | null
}

const usageRecords: AgentUsageRecord[] = []

export function resetUsageRecords(): void {
  usageRecords.length = 0
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

  const record: AgentUsageRecord = {
    agentName,
    model,
    iterations: result.iterations.length,
    estimatedCostUsd: parseCostFromStdout(result.stdout),
    ...totals,
  }
  usageRecords.push(record)
  return record
}

export function getUsageRecords(): readonly AgentUsageRecord[] {
  return usageRecords
}

export function formatUsageMarkdown(records: readonly AgentUsageRecord[]): string {
  if (records.length === 0) {
    return '_No agent usage captured (agents skipped or provider did not report tokens)._'
  }

  const lines = records.map((record) => {
    const directInput = record.inputTokens
    const totalInput =
      directInput + record.cacheReadInputTokens + record.cacheCreationInputTokens
    return [
      `### ${record.agentName}`,
      `- **Model:** \`${record.model}\``,
      `- **Iterations:** ${record.iterations}`,
      `- **Input tokens (direct):** ${directInput.toLocaleString()}`,
      `- **Input tokens (cache read):** ${record.cacheReadInputTokens.toLocaleString()}`,
      `- **Input tokens (cache create):** ${record.cacheCreationInputTokens.toLocaleString()}`,
      `- **Input tokens (total):** ${totalInput.toLocaleString()}`,
      `- **Output tokens:** ${record.outputTokens.toLocaleString()}`,
    ].join('\n')
  })

  const costLines = records
    .filter((record) => record.estimatedCostUsd !== null)
    .map(
      (record) =>
        `- **${record.agentName} estimated cost:** $${record.estimatedCostUsd?.toFixed(6)}`
    )

  const grandTotal = records.reduce(
    (acc, record) => {
      acc.input += record.inputTokens + record.cacheReadInputTokens + record.cacheCreationInputTokens
      acc.output += record.outputTokens
      return acc
    },
    { input: 0, output: 0 }
  )

  const totalCost = records.reduce((sum, record) => sum + (record.estimatedCostUsd ?? 0), 0)

  return [
    ...lines,
    '',
    '### Totals',
    `- **Total input tokens:** ${grandTotal.input.toLocaleString()}`,
    `- **Total output tokens:** ${grandTotal.output.toLocaleString()}`,
    `- **Primary models:** ${[...new Set(records.map((r) => r.model))].join(', ')}`,
    ...(totalCost > 0 ? [`- **Total estimated cost:** $${totalCost.toFixed(6)}`] : []),
    ...(costLines.length > 0 ? ['', ...costLines] : []),
  ].join('\n')
}

/** Best-effort parse of Claude Code cost JSON embedded in agent stdout. */
export function parseCostFromStdout(stdout: string): number | null {
  const match = stdout.match(/"total_cost_usd"\s*:\s*([0-9.]+)/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}
