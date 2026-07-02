/**
 * Safe, backend-driven chart specification for chat visualizations.
 *
 * The backend (e.g. Google Ads / Facebook Ads routes) is the single source of
 * truth: it decides the chart type, axes, and series purely from the data. The
 * frontend never computes chart logic — it only renders these specs.
 *
 * This keeps the contract small and serializable (safe to send over SSE / JSON)
 * and avoids shipping raw ECharts option objects from the backend.
 */

export type Chart2DType = 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'funnel'
export type Chart3DType = 'bar3D' | 'scatter3D' | 'surface' | 'line3D'
export type ChartType = Chart2DType | Chart3DType

const CHART_2D_TYPES: readonly Chart2DType[] = ['bar', 'line', 'area', 'pie', 'scatter', 'funnel']
const CHART_3D_TYPES: readonly Chart3DType[] = ['bar3D', 'scatter3D', 'surface', 'line3D']
const ALL_CHART_TYPES: readonly ChartType[] = [...CHART_2D_TYPES, ...CHART_3D_TYPES]

export type ChartAxisType = 'category' | 'value' | 'time' | 'log'

export interface ChartAxis {
  /** Axis label shown next to the axis. */
  name?: string
  /** ECharts axis kind. Defaults are inferred by the adapter when omitted. */
  type?: ChartAxisType
  /** Category labels (used when type is 'category'). */
  data?: Array<string | number>
}

/** A single data point. Shape depends on chart type (2D vs 3D). */
export type ChartDataPoint =
  | number
  | string
  | [string | number, number]
  | [number, number, number]
  | { name: string; value: number | number[] }

export interface ChartSeries {
  name?: string
  /** Optional per-series override; falls back to the spec-level `type`. */
  type?: ChartType
  data: ChartDataPoint[]
  /** Stack id for stacked bar/area charts. */
  stack?: string
  /** Optional explicit color for this series. */
  color?: string
}

export interface ChartSpec {
  /** Stable id (used as React key + for persistence). */
  id?: string
  type: ChartType
  title?: string
  subtitle?: string
  xAxis?: ChartAxis
  yAxis?: ChartAxis
  /** Third axis, only meaningful for 3D chart types. */
  zAxis?: ChartAxis
  series: ChartSeries[]
  /** Show the legend. Defaults to true when there is more than one series. */
  legend?: boolean
  /** Render height in px. Defaults applied by the renderer. */
  height?: number
  /** Explicit 3D flag; also inferred from the chart type. */
  is3D?: boolean
}

/** True for chart types that require the echarts-gl (WebGL) extension. */
export function is3DChartType(type: ChartType): type is Chart3DType {
  return (CHART_3D_TYPES as readonly string[]).includes(type)
}

/** True if a spec (by type or explicit flag) needs the 3D/WebGL renderer. */
export function isSpec3D(spec: ChartSpec): boolean {
  return spec.is3D === true || is3DChartType(spec.type)
}

function isChartType(value: unknown): value is ChartType {
  return typeof value === 'string' && (ALL_CHART_TYPES as readonly string[]).includes(value)
}

/** Runtime guard for a single chart spec (defensive against untrusted payloads). */
export function isChartSpec(value: unknown): value is ChartSpec {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (!isChartType(v.type)) return false
  if (!Array.isArray(v.series)) return false
  return v.series.every(
    (s) => s && typeof s === 'object' && Array.isArray((s as Record<string, unknown>).data)
  )
}

export function isChartSpecArray(value: unknown): value is ChartSpec[] {
  return Array.isArray(value) && value.length > 0 && value.every(isChartSpec)
}

/**
 * Pulls a `visualizations` array out of an arbitrary payload.
 *
 * Handles the common shapes that appear in chat:
 *  - a message content object: `{ visualizations: [...] }`
 *  - a workflow block output map: `{ [blockId]: { visualizations: [...] } }`
 *  - a nested `output`/`result`/`data` wrapper
 *
 * Returns only valid specs; anything malformed is dropped.
 */
export function extractVisualizations(payload: unknown, depth = 0): ChartSpec[] {
  if (!payload || typeof payload !== 'object' || depth > 4) return []

  if (isChartSpec(payload)) {
    return [payload]
  }

  if (isChartSpecArray(payload)) {
    return payload
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractVisualizations(item, depth + 1)
      if (found.length > 0) return found
    }
    return []
  }

  const obj = payload as Record<string, unknown>

  if ('visualizations' in obj) {
    const raw = obj.visualizations
    const specs = Array.isArray(raw) ? raw.filter(isChartSpec) : []
    if (specs.length > 0) return specs
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = extractVisualizations(value, depth + 1)
      if (found.length > 0) return found
    }
  }

  return []
}
