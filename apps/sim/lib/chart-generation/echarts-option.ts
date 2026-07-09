/**
 * Detection and sanitization helpers for rendering agent/tool-provided ECharts
 * option objects in chat surfaces. These are intentionally conservative so that
 * arbitrary JSON is not mistaken for a chart configuration.
 */

/** Maximum number of data points kept per series before truncation. */
const MAX_SERIES_DATA_POINTS = 5000

/** ECharts series `type` values recognized as valid chart configurations. */
const ALLOWED_SERIES_TYPES = new Set([
  'bar',
  'line',
  'pie',
  'scatter',
  'effectScatter',
  'radar',
  'candlestick',
  'boxplot',
  'heatmap',
  'funnel',
  'gauge',
  'graph',
  'sankey',
  'sunburst',
  'tree',
  'treemap',
  'themeRiver',
  'pictorialBar',
  'map',
  'lines',
  'custom',
])

/**
 * Minimal structural shape for a recognized ECharts option. The full option
 * surface is intentionally left open ended via the index signature.
 */
export interface EChartsOptionLike {
  series: Array<Record<string, unknown>>
  [key: string]: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Returns true when the value looks like a renderable ECharts option: it must be
 * a plain object with a non-empty `series` array whose entries each declare a
 * recognized `type`.
 */
export function isEChartsOption(value: unknown): value is EChartsOptionLike {
  if (!isRecord(value)) {
    return false
  }

  const series = value.series
  if (!Array.isArray(series) || series.length === 0) {
    return false
  }

  return series.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.type === 'string' &&
      ALLOWED_SERIES_TYPES.has(entry.type)
  )
}

/**
 * Attempts to extract an ECharts option from a string. Supports a raw JSON
 * object or a single fenced code block (```json / ```echarts / bare fence).
 * Returns null when the string is not a recognized ECharts option.
 */
export function parseEChartsOptionFromString(value: string): EChartsOptionLike | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  let candidate = trimmed

  const fenceMatch = trimmed.match(/^```(?:json|echarts)?\s*([\s\S]*?)```$/i)
  if (fenceMatch?.[1]) {
    candidate = fenceMatch[1].trim()
  }

  if (!candidate.startsWith('{') || !candidate.endsWith('}')) {
    return null
  }

  try {
    const parsed = JSON.parse(candidate)
    return isEChartsOption(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Resolves an ECharts option from arbitrary message content, handling both
 * already-parsed objects and JSON strings (optionally fenced).
 */
export function resolveEChartsOptionFromContent(content: unknown): EChartsOptionLike | null {
  if (isEChartsOption(content)) {
    return content
  }
  if (typeof content === 'string') {
    return parseEChartsOptionFromString(content)
  }
  return null
}

function resolveEChartsOptionsFromParsed(value: unknown): EChartsOptionLike[] | null {
  if (isEChartsOption(value)) {
    return [value]
  }

  if (!isRecord(value)) {
    return null
  }

  const charts = value.charts
  if (!Array.isArray(charts) || charts.length === 0) {
    return null
  }

  if (!charts.every(isEChartsOption)) {
    return null
  }

  return charts
}

/**
 * Attempts to extract one or more ECharts options from a string. Supports a raw
 * JSON object, a `{ charts: [...] }` dashboard wrapper, or a single fenced code
 * block (```json / ```echarts / bare fence).
 */
export function parseEChartsOptionsFromString(value: string): EChartsOptionLike[] | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  let candidate = trimmed

  const fenceMatch = trimmed.match(/^```(?:json|echarts)?\s*([\s\S]*?)```$/i)
  if (fenceMatch?.[1]) {
    candidate = fenceMatch[1].trim()
  }

  if (!candidate.startsWith('{') || !candidate.endsWith('}')) {
    return null
  }

  try {
    const parsed = JSON.parse(candidate)
    return resolveEChartsOptionsFromParsed(parsed)
  } catch {
    return null
  }
}

/**
 * Resolves one or more ECharts options from arbitrary message content. Returns a
 * single-item array for a lone option, or every entry from a `{ charts: [...] }`
 * dashboard wrapper when each chart is valid.
 */
export function resolveEChartsOptionsFromContent(content: unknown): EChartsOptionLike[] | null {
  if (typeof content === 'string') {
    return parseEChartsOptionsFromString(content)
  }

  return resolveEChartsOptionsFromParsed(content)
}

/**
 * Returns a defensive copy of the option with oversized series data truncated.
 * Falls back to the original option if cloning fails.
 */
export function sanitizeEChartsOption(option: EChartsOptionLike): EChartsOptionLike {
  let clone: EChartsOptionLike
  try {
    clone = structuredClone(option)
  } catch {
    return option
  }

  if (Array.isArray(clone.series)) {
    for (const series of clone.series) {
      if (isRecord(series) && Array.isArray(series.data) && series.data.length > MAX_SERIES_DATA_POINTS) {
        series.data = series.data.slice(0, MAX_SERIES_DATA_POINTS)
      }
    }
  }

  return clone
}
