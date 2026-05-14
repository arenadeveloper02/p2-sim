/**
 * Pre-compute aggregate metrics so the LLM does not have to do arithmetic
 * and we have a trustworthy ground truth to anchor the output.
 */

const MICRO = 1_000_000

export function normalizeInput(input: unknown): unknown[] | null {
  if (Array.isArray(input)) return input
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input)
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>
        if (Array.isArray(obj.results)) return obj.results
        if (Array.isArray(obj.rows)) return obj.rows
      }
    } catch {
      return null
    }
  }
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>
    if (Array.isArray(obj.results)) return obj.results
    if (Array.isArray(obj.rows)) return obj.rows
  }
  return null
}

function readNumber(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const value = readDeep(row, k)
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      return Number(value)
    }
  }
  return 0
}

function readDeep(row: Record<string, unknown>, path: string): unknown {
  if (path in row) return row[path]
  const parts = path.split('.')
  let cur: unknown = row
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return cur
}

export interface AggregateMetrics {
  row_count: number
  total_impressions: number
  total_clicks: number
  total_cost_micros: number
  total_cost_usd: number
  total_conversions: number
  total_conversions_value: number
  total_all_conversions: number
  total_all_conversions_value: number
  blended_ctr: number | null
  blended_cpc_usd: number | null
  blended_cpa_usd: number | null
  blended_roas: number | null
  blended_conversion_rate: number | null
}

export function computeAggregateMetrics(rows: unknown[]): AggregateMetrics {
  let impressions = 0
  let clicks = 0
  let costMicros = 0
  let conversions = 0
  let conversionsValue = 0
  let allConversions = 0
  let allConversionsValue = 0

  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    const row = r as Record<string, unknown>
    impressions += readNumber(row, 'metrics.impressions', 'impressions')
    clicks += readNumber(row, 'metrics.clicks', 'clicks')
    costMicros += readNumber(row, 'metrics.cost_micros', 'cost_micros', 'cost')
    conversions += readNumber(row, 'metrics.conversions', 'conversions')
    conversionsValue += readNumber(
      row,
      'metrics.conversions_value',
      'conversions_value',
      'conversion_value'
    )
    allConversions += readNumber(row, 'metrics.all_conversions', 'all_conversions')
    allConversionsValue += readNumber(row, 'metrics.all_conversions_value', 'all_conversions_value')
  }

  const costUsd = costMicros / MICRO
  const blendedCtr = impressions > 0 ? clicks / impressions : null
  const blendedCpc = clicks > 0 ? costUsd / clicks : null
  const blendedCpa = conversions > 0 ? costUsd / conversions : null
  const blendedRoas = costUsd > 0 ? conversionsValue / costUsd : null
  const blendedConvRate = clicks > 0 ? conversions / clicks : null

  return {
    row_count: rows.length,
    total_impressions: impressions,
    total_clicks: clicks,
    total_cost_micros: costMicros,
    total_cost_usd: round2(costUsd),
    total_conversions: round2(conversions),
    total_conversions_value: round2(conversionsValue),
    total_all_conversions: round2(allConversions),
    total_all_conversions_value: round2(allConversionsValue),
    blended_ctr: blendedCtr === null ? null : round4(blendedCtr),
    blended_cpc_usd: blendedCpc === null ? null : round2(blendedCpc),
    blended_cpa_usd: blendedCpa === null ? null : round2(blendedCpa),
    blended_roas: blendedRoas === null ? null : round2(blendedRoas),
    blended_conversion_rate: blendedConvRate === null ? null : round4(blendedConvRate),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
