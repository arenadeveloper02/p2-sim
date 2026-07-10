import {
  type EChartsOptionLike,
  isEChartsOption,
} from '@/lib/chart-generation/echarts-option'

export interface NormalizedChartOutput {
  charts: EChartsOptionLike[]
  count: number
  content: string
}

function looksLikeChartOption(value: unknown): value is EChartsOptionLike {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    'series' in record ||
    'xAxis' in record ||
    'yAxis' in record ||
    'radiusAxis' in record ||
    'angleAxis' in record
  )
}

function stripMarkdownFence(value: string): string {
  let out = value.trim()
  const fenceMatch = out.match(/^```[a-zA-Z0-9]*\s*\n?([\s\S]*?)\n?```$/)
  if (fenceMatch) {
    return fenceMatch[1].trim()
  }

  const openMatch = out.match(/^```[a-zA-Z0-9]*\s*\n?/)
  if (openMatch) {
    out = out.slice(openMatch[0].length)
    out = out.replace(/```\s*$/, '').trim()
  }

  return out
}

function buildChartContent(charts: EChartsOptionLike[]): string {
  return JSON.stringify({ charts, count: charts.length })
}

/**
 * Normalizes raw LLM chart output into a consistent `{ charts, count, content }` shape.
 * `content` is a JSON string wrapper for chat surfaces that read the `content` output path.
 */
export function normalizeChartOutput(raw: string): NormalizedChartOutput {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed) {
    return { charts: [], count: 0, content: '' }
  }

  const candidate = stripMarkdownFence(trimmed)

  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return { charts: [], count: 0, content: trimmed }
  }

  let charts: EChartsOptionLike[] = []

  if (Array.isArray(parsed)) {
    charts = parsed.filter(looksLikeChartOption).filter(isEChartsOption)
  } else if (looksLikeChartOption(parsed) && isEChartsOption(parsed)) {
    charts = [parsed]
  } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>
    const nestedCharts = record.charts
    if (Array.isArray(nestedCharts)) {
      charts = nestedCharts.filter(looksLikeChartOption).filter(isEChartsOption)
    }
  }

  if (charts.length === 0) {
    return { charts: [], count: 0, content: trimmed }
  }

  return {
    charts,
    count: charts.length,
    content: buildChartContent(charts),
  }
}
