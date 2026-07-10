import {
  type EChartsOptionLike,
  isEChartsOption,
  resolveEChartsOptionsFromContent,
} from '@/lib/chart-generation/echarts-option'

/**
 * Returns a compact chart JSON string suitable for chat `message.content` when the
 * workflow output contains renderable ECharts data. Prefer the normalized `content`
 * field or a `{ charts, count }` wrapper over fenced full block JSON.
 */
export function formatChartContentForChat(output: unknown): string | null {
  if (output === null || output === undefined) {
    return null
  }

  if (typeof output === 'string') {
    const trimmed = output.trim()
    return resolveEChartsOptionsFromContent(trimmed) ? trimmed : null
  }

  if (!isChartOutputRecord(output)) {
    return null
  }

  if (typeof output.content === 'string') {
    const nested = output.content.trim()
    if (resolveEChartsOptionsFromContent(nested)) {
      return nested
    }
  }

  if (Array.isArray(output.charts) && output.charts.length > 0) {
    const count = typeof output.count === 'number' ? output.count : output.charts.length
    const wrapper = JSON.stringify({ charts: output.charts, count })
    if (resolveEChartsOptionsFromContent(wrapper)) {
      return wrapper
    }
  }

  if (resolveEChartsOptionsFromContent(output)) {
    return JSON.stringify(output)
  }

  return null
}

function isChartOutputRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
