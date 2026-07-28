/**
 * Detection and sanitization helpers for rendering agent/tool-provided ECharts
 * option objects in chat surfaces. These are intentionally conservative so that
 * arbitrary JSON is not mistaken for a chart configuration.
 */

/** Maximum number of data points kept per series before truncation. */
const MAX_SERIES_DATA_POINTS = 5000

function isRecognizedSeriesType(type: unknown): type is string {
  if (typeof type !== 'string') return false
  const normalized = type.trim()
  if (!normalized) return false
  // Permissive: accept any non-empty series type so new ECharts types work without code changes.
  return true
}

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

  return series.every((entry) => isRecord(entry) && isRecognizedSeriesType(entry.type))
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

  if (Array.isArray(value)) {
    const charts = value.filter(isEChartsOption)
    return charts.length > 0 ? charts : null
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

const EMBEDDED_FENCE_REGEX = /```(?:json|echarts)?\s*([\s\S]*?)```/gi

function tryParseEChartsJsonCandidate(candidate: string): EChartsOptionLike[] | null {
  const trimmed = candidate.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed)
    return resolveEChartsOptionsFromParsed(parsed)
  } catch {
    return null
  }
}

function tryParseWholeEChartsString(value: string): EChartsOptionLike[] | null {
  let candidate = value.trim()
  const fenceMatch = candidate.match(/^```(?:json|echarts)?\s*([\s\S]*?)```$/i)
  if (fenceMatch?.[1]) {
    candidate = fenceMatch[1].trim()
  }
  return tryParseEChartsJsonCandidate(candidate)
}

function tryParseEmbeddedEChartsFences(value: string): EChartsOptionLike[] | null {
  const charts: EChartsOptionLike[] = []
  for (const match of value.matchAll(EMBEDDED_FENCE_REGEX)) {
    const inner = match[1]?.trim()
    if (!inner) continue
    const parsed = tryParseEChartsJsonCandidate(inner)
    if (parsed) charts.push(...parsed)
  }
  return charts.length > 0 ? charts : null
}

const BARE_JSON_LINE_START_REGEX = /^[ \t]*[[{]/gm

/**
 * Detects un-fenced chart JSON appended after prose (the chart generator's
 * mixed "answer text + bare option JSON" responses use no code fences). Returns
 * the parsed charts plus the index where the JSON starts so prose can be split.
 */
function findTrailingBareEChartsJson(
  value: string
): { charts: EChartsOptionLike[]; jsonStart: number } | null {
  for (const match of value.matchAll(BARE_JSON_LINE_START_REGEX)) {
    const index = match.index ?? 0
    if (index === 0) continue // whole-string JSON is handled separately
    const charts = tryParseEChartsJsonCandidate(value.slice(index))
    if (charts) {
      return { charts, jsonStart: index }
    }
  }
  return null
}

/**
 * Attempts to extract one or more ECharts options from a string. Supports a raw
 * JSON object, a `{ charts: [...] }` dashboard wrapper, a single fenced code
 * block, or chart JSON embedded after other text (deployed chat combines agent
 * text + chart generator dashboard in one message).
 */
export function parseEChartsOptionsFromString(value: string): EChartsOptionLike[] | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return (
    tryParseWholeEChartsString(trimmed) ??
    tryParseEmbeddedEChartsFences(trimmed) ??
    findTrailingBareEChartsJson(trimmed)?.charts ??
    null
  )
}

/**
 * Removes fenced or inline chart/dashboard JSON from mixed assistant text so prose
 * and charts can render separately in deployed chat.
 */
export function stripEChartsJsonFromContent(content: string): string {
  let out = content.replace(EMBEDDED_FENCE_REGEX, (full, inner: string) => {
    if (tryParseEChartsJsonCandidate(inner)) {
      return ''
    }
    return full
  })

  if (tryParseEChartsJsonCandidate(out)) {
    return ''
  }

  const trailing = findTrailingBareEChartsJson(out)
  if (trailing) {
    out = out.slice(0, trailing.jsonStart)
  }

  return out.replace(/\n{3,}/g, '\n\n').trim()
}

/** True when a deploy output value contains at least one renderable chart. */
export function hasRenderableChartDeployOutput(value: unknown): boolean {
  if (typeof value === 'string') {
    return parseEChartsOptionsFromString(value) !== null
  }
  return resolveEChartsOptionsFromParsed(value) !== null
}

/**
 * Formats chart generator deploy output for chat message content, or returns null
 * when there are no charts to show (e.g. skipped / empty dashboard).
 */
export function formatChartDeployOutputForChat(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'string') {
    return hasRenderableChartDeployOutput(value) ? value : null
  }
  if (!hasRenderableChartDeployOutput(value)) {
    return null
  }
  try {
    return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
  } catch {
    return String(value)
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
      if (
        isRecord(series) &&
        Array.isArray(series.data) &&
        series.data.length > MAX_SERIES_DATA_POINTS
      ) {
        series.data = series.data.slice(0, MAX_SERIES_DATA_POINTS)
      }
    }
  }

  return clone
}
