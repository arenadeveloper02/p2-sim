import {
  type EChartsOptionLike,
  isEChartsOption,
  sanitizeEChartsOption,
} from '@/lib/chart-generation/echarts-option'

export const CONSTRAINED_CHART_TYPES = ['bar', 'line', 'area', 'pie'] as const

export type ConstrainedChartType = (typeof CONSTRAINED_CHART_TYPES)[number]

export interface ConstrainedChartSeries {
  name: string
  data: number[]
}

export interface ConstrainedChartDsl {
  title?: string
  chartType: ConstrainedChartType
  categories: string[]
  series: ConstrainedChartSeries[]
  showLegend: boolean
  stacked: boolean
}

export interface ConstrainedChartTheme {
  text: string
  muted: string
  border: string
  brand: string
}

export const DEFAULT_CONSTRAINED_CHART_THEME: ConstrainedChartTheme = {
  text: '#2c2d33',
  muted: '#575a66',
  border: '#e2e3e5',
  brand: '#1a73e8',
}

const FALLBACK_PALETTE = ['#2ABBF8', '#00C48C', '#FFCC02', '#FA4EDF', '#FF7A45', '#5B8FF9', '#9E7FEA']

export function isConstrainedChartType(value: unknown): value is ConstrainedChartType {
  return typeof value === 'string' && CONSTRAINED_CHART_TYPES.includes(value as ConstrainedChartType)
}

/**
 * Builds a sanitized ECharts option from the constrained Arena/home chart DSL.
 * Returns null when there is nothing to plot.
 */
export function buildConstrainedEChartsOption(
  dsl: ConstrainedChartDsl,
  theme: ConstrainedChartTheme = DEFAULT_CONSTRAINED_CHART_THEME
): EChartsOptionLike | null {
  if (dsl.series.length === 0) return null

  const palette = [theme.brand, ...FALLBACK_PALETTE]
  const axisCommon = {
    axisLabel: { color: theme.muted, fontSize: 11 },
    axisLine: { lineStyle: { color: theme.border } },
    splitLine: { lineStyle: { color: theme.border } },
  }
  const showLegend = dsl.showLegend
  const base: Record<string, unknown> = {
    animation: false,
    color: palette,
    tooltip: { trigger: dsl.chartType === 'pie' ? 'item' : 'axis' },
    ...(dsl.title
      ? {
          title: {
            text: dsl.title,
            left: 'left',
            textStyle: { fontSize: 14, fontWeight: 600, color: theme.text },
          },
        }
      : {}),
    ...(showLegend
      ? {
          legend: {
            top: dsl.title ? 28 : 0,
            textStyle: { color: theme.muted, fontSize: 11 },
          },
        }
      : { legend: { show: false } }),
  }

  let option: Record<string, unknown>
  if (dsl.chartType === 'pie') {
    const values = dsl.series[0]?.data ?? []
    option = {
      ...base,
      series: [
        {
          type: 'pie',
          name: dsl.series[0]?.name ?? 'Value',
          radius: ['38%', '68%'],
          center: ['50%', dsl.title ? '54%' : '50%'],
          label: { color: theme.muted, fontSize: 11 },
          data: values.map((value, index) => ({
            name: dsl.categories[index] ?? `Item ${index + 1}`,
            value,
          })),
        },
      ],
    }
  } else {
    const categories =
      dsl.categories.length > 0
        ? dsl.categories
        : Array.from(
            { length: Math.max(...dsl.series.map((entry) => entry.data.length), 0) },
            (_, index) => `${index + 1}`
          )
    const seriesType = dsl.chartType === 'area' ? 'line' : dsl.chartType
    option = {
      ...base,
      grid: {
        left: 48,
        right: 16,
        top: dsl.title ? 56 : showLegend ? 36 : 24,
        bottom: showLegend ? 48 : 40,
      },
      xAxis: { type: 'category', data: categories, ...axisCommon },
      yAxis: { type: 'value', ...axisCommon },
      series: dsl.series.map((entry) => ({
        type: seriesType,
        name: entry.name,
        data: entry.data,
        smooth: dsl.chartType !== 'bar',
        ...(dsl.stacked && (dsl.chartType === 'bar' || dsl.chartType === 'area')
          ? { stack: 'total' }
          : {}),
        ...(dsl.chartType === 'area' ? { areaStyle: { opacity: 0.18 } } : {}),
        ...(dsl.chartType === 'bar'
          ? { barMaxWidth: 28, itemStyle: { borderRadius: [3, 3, 0, 0] } }
          : {}),
      })),
    }
  }

  if (!isEChartsOption(option)) {
    return null
  }
  return sanitizeEChartsOption(option)
}
