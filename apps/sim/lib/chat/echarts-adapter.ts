/**
 * Converts a safe, backend-driven {@link ChartSpec} into an ECharts option
 * object. This is the only place that knows about ECharts' option shape, so the
 * rest of the app stays framework-agnostic.
 *
 * Supports 2D (bar/line/area/pie/scatter) and 3D (bar3D/scatter3D/surface/
 * line3D) charts. 3D types require the `echarts-gl` extension to be loaded by
 * the renderer before the option is applied.
 */

import { type ChartAxis, type ChartSeries, type ChartSpec, is3DChartType } from './chart-types'

export interface ChartTheme {
  textColor: string
  axisLineColor: string
  splitLineColor: string
  tooltipBg: string
  tooltipBorder: string
}

export const LIGHT_THEME: ChartTheme = {
  textColor: '#334155',
  axisLineColor: '#cbd5e1',
  splitLineColor: '#e2e8f0',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e2e8f0',
}

export const DARK_THEME: ChartTheme = {
  textColor: '#e2e8f0',
  axisLineColor: '#3f3f46',
  splitLineColor: '#27272a',
  tooltipBg: '#18181b',
  tooltipBorder: '#3f3f46',
}

/** Balanced categorical palette that reads well on light and dark backgrounds. */
export const CHART_PALETTE = [
  '#6366f1',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#84cc16',
]

function axisType(axis: ChartAxis | undefined, fallback: 'category' | 'value'): string {
  return axis?.type ?? fallback
}

function resolveSeriesType(spec: ChartSpec, series: ChartSeries): string {
  const type = series.type ?? spec.type
  // 'area' is a line chart with areaStyle in ECharts.
  if (type === 'area') return 'line'
  return type
}

function build2DSeries(spec: ChartSpec): Record<string, unknown>[] {
  return spec.series.map((series, index) => {
    const type = resolveSeriesType(spec, series)
    const isArea = (series.type ?? spec.type) === 'area'
    const base: Record<string, unknown> = {
      name: series.name ?? `Series ${index + 1}`,
      type,
      data: series.data,
      ...(series.stack ? { stack: series.stack } : {}),
      ...(series.color ? { color: series.color } : {}),
    }

    if (isArea) base.areaStyle = {}
    if (type === 'line') base.smooth = true
    if (type === 'bar') base.barMaxWidth = 48

    if (type === 'pie') {
      base.radius = ['35%', '70%']
      base.itemStyle = { borderRadius: 6, borderColor: 'transparent', borderWidth: 2 }
      base.label = { color: 'inherit' }
    }

    return base
  })
}

function build3DSeries(spec: ChartSpec): Record<string, unknown>[] {
  return spec.series.map((series, index) => {
    const type = series.type ?? spec.type
    return {
      name: series.name ?? `Series ${index + 1}`,
      type,
      data: series.data,
      ...(series.color ? { itemStyle: { color: series.color } } : {}),
      shading: 'lambert',
      ...(type === 'bar3D' ? { bevelSize: 0.1 } : {}),
    }
  })
}

function buildTitle(spec: ChartSpec, theme: ChartTheme): Record<string, unknown> | undefined {
  if (!spec.title && !spec.subtitle) return undefined
  return {
    text: spec.title,
    subtext: spec.subtitle,
    left: 'center',
    textStyle: { color: theme.textColor, fontSize: 14, fontWeight: 600 },
    subtextStyle: { color: theme.textColor, fontSize: 12 },
  }
}

/**
 * Produce an ECharts option object from a spec.
 * The result is a plain object; callers pass it to `chart.setOption(...)`.
 */
export function specToEChartsOption(
  spec: ChartSpec,
  theme: ChartTheme = LIGHT_THEME
): Record<string, unknown> {
  const showLegend = spec.legend ?? spec.series.length > 1
  const title = buildTitle(spec, theme)

  const common: Record<string, unknown> = {
    color: CHART_PALETTE,
    backgroundColor: 'transparent',
    textStyle: { color: theme.textColor },
    ...(title ? { title } : {}),
    tooltip: {
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.textColor },
    },
    ...(showLegend
      ? {
          legend: {
            top: title ? 28 : 4,
            textStyle: { color: theme.textColor },
            type: 'scroll',
          },
        }
      : {}),
  }

  // ---- 3D ----
  if (is3DChartType(spec.type) || spec.is3D) {
    return {
      ...common,
      tooltip: { ...(common.tooltip as object) },
      xAxis3D: { type: axisType(spec.xAxis, 'category'), name: spec.xAxis?.name },
      yAxis3D: { type: axisType(spec.yAxis, 'category'), name: spec.yAxis?.name },
      zAxis3D: { type: axisType(spec.zAxis, 'value'), name: spec.zAxis?.name },
      grid3D: {
        boxWidth: 100,
        boxDepth: 80,
        axisLine: { lineStyle: { color: theme.axisLineColor } },
        splitLine: { lineStyle: { color: theme.splitLineColor } },
        viewControl: { autoRotate: false },
      },
      series: build3DSeries(spec),
    }
  }

  // ---- Pie (no cartesian axes) ----
  if (spec.type === 'pie') {
    return {
      ...common,
      tooltip: { ...(common.tooltip as object), trigger: 'item' },
      series: build2DSeries(spec),
    }
  }

  // ---- Cartesian 2D ----
  const categories = spec.xAxis?.data
  return {
    ...common,
    tooltip: { ...(common.tooltip as object), trigger: 'axis' },
    grid: { left: 48, right: 24, top: title ? 56 : 32, bottom: 40, containLabel: true },
    xAxis: {
      type: axisType(spec.xAxis, 'category'),
      name: spec.xAxis?.name,
      ...(categories ? { data: categories } : {}),
      axisLine: { lineStyle: { color: theme.axisLineColor } },
      axisLabel: { color: theme.textColor },
    },
    yAxis: {
      type: axisType(spec.yAxis, 'value'),
      name: spec.yAxis?.name,
      axisLine: { lineStyle: { color: theme.axisLineColor } },
      splitLine: { lineStyle: { color: theme.splitLineColor } },
      axisLabel: { color: theme.textColor },
    },
    series: build2DSeries(spec),
  }
}
