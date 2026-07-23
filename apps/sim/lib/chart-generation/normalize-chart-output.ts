/**
 * Normalize arbitrary LLM / workflow content into a chat-ready chart payload.
 *
 * NO chart-intent or metric rules here — only structure detection and validation.
 * Intent (bar vs pie, when to chart) is decided by the Chart Generator block's
 * LLM prompts and skills, not by TypeScript.
 */

import {
  type EChartsOptionLike,
  isEChartsOption,
  resolveEChartsOptionsFromContent,
} from './echarts-option'

export interface ChartDashboardOutput {
  charts: EChartsOptionLike[]
  count: number
  valid: boolean
  /** True when the model intentionally returned no charts (no visualization intent). */
  skipped: boolean
}

export interface NormalizeChartOutputOptions {
  /** When true, plain text that is not chart JSON is treated as skipped (not invalid). */
  allowPlainTextSkip?: boolean
}

function stripCodeFences(value: string): string {
  let out = value.trim()
  const fullFence = out.match(/^```[a-zA-Z0-9]*\s*\n?([\s\S]*?)\n?```$/)
  if (fullFence?.[1]) return fullFence[1].trim()

  const openFence = out.match(/^```[a-zA-Z0-9]*\s*\n?/)
  if (openFence) {
    out = out
      .slice(openFence[0].length)
      .replace(/```\s*$/, '')
      .trim()
  }
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Unwrap skill-style envelopes `{ option, chartType, ... }` or arrays of them.
 */
function unwrapChartCandidates(parsed: unknown): unknown[] {
  if (isEChartsOption(parsed)) return [parsed]

  if (Array.isArray(parsed)) {
    const candidates: unknown[] = []
    for (const item of parsed) {
      candidates.push(...unwrapChartCandidates(item))
    }
    return candidates
  }

  if (!isRecord(parsed)) return []

  if (Array.isArray(parsed.charts)) {
    const charts: unknown[] = []
    for (const item of parsed.charts) {
      charts.push(...unwrapChartCandidates(item))
    }
    return charts
  }

  if (isEChartsOption(parsed.option)) return [parsed.option]

  return []
}

function buildOutput(charts: EChartsOptionLike[], skipped: boolean): ChartDashboardOutput {
  return {
    charts,
    count: charts.length,
    valid: charts.length > 0,
    skipped,
  }
}

/**
 * Parse and validate chart JSON from LLM text, objects, or upstream block output.
 */
export function normalizeChartOutput(
  content: unknown,
  options: NormalizeChartOutputOptions = {}
): ChartDashboardOutput {
  const { allowPlainTextSkip = true } = options

  if (content == null || content === '') {
    return buildOutput([], true)
  }

  // Already normalized dashboard object
  if (isRecord(content) && Array.isArray(content.charts)) {
    const resolved = resolveEChartsOptionsFromContent(content)
    if (resolved?.length) return buildOutput(resolved, false)
    if (content.count === 0 || content.charts.length === 0) {
      return buildOutput([], true)
    }
  }

  const direct = resolveEChartsOptionsFromContent(content)
  if (direct?.length) return buildOutput(direct, false)

  let candidate = content
  if (typeof content === 'string') {
    const stripped = stripCodeFences(content)
    if (!stripped) return buildOutput([], true)

    try {
      candidate = JSON.parse(stripped)
    } catch {
      if (allowPlainTextSkip) {
        return buildOutput([], true)
      }
      return buildOutput([], false)
    }
  }

  if (isRecord(candidate) && candidate.count === 0 && Array.isArray(candidate.charts)) {
    return buildOutput([], true)
  }

  const unwrapped = unwrapChartCandidates(candidate)
  const charts = unwrapped.filter(isEChartsOption)
  if (charts.length > 0) return buildOutput(charts, false)

  const retryResolved = resolveEChartsOptionsFromContent(candidate)
  if (retryResolved?.length) return buildOutput(retryResolved, false)

  return buildOutput([], allowPlainTextSkip)
}
