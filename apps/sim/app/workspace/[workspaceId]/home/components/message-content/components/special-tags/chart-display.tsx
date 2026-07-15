'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@sim/emcn'
import type { EChartsOption, EChartsType, SeriesOption } from 'echarts'
import type {
  ChartTagData,
  ChartTagSeries,
} from '@/app/workspace/[workspaceId]/home/components/message-content/components/special-tags/special-tags'

const SERIES_PALETTE = [
  '#6F5EF9',
  '#2ABBF8',
  '#00C48C',
  '#FFCC02',
  '#FA4EDF',
  '#FF7A45',
  '#5B8FF9',
  '#9E7FEA',
] as const

interface ChartThemeColors {
  text: string
  subtleText: string
  grid: string
}

/**
 * Resolves theme colors from the container's computed style so the canvas
 * follows the app's light/dark CSS variables (canvas cannot consume `var()`).
 */
function resolveThemeColors(element: HTMLElement): ChartThemeColors {
  const style = getComputedStyle(element)
  const text = style.color || '#666'
  return {
    text,
    subtleText: text,
    grid: style.borderColor || 'rgba(128, 128, 128, 0.2)',
  }
}

function toCartesianData(series: ChartTagSeries): Array<number | [number, number]> {
  return series.data
}

function buildOption(data: ChartTagData, colors: ChartThemeColors): EChartsOption {
  const axisCommon = {
    axisLabel: { color: colors.subtleText, fontSize: 11 },
    axisLine: { lineStyle: { color: colors.grid } },
    splitLine: { lineStyle: { color: colors.grid } },
  }

  const base: EChartsOption = {
    color: [...SERIES_PALETTE],
    ...(data.title
      ? {
          title: {
            text: data.title,
            left: 'center',
            textStyle: { color: colors.text, fontSize: 13, fontWeight: 600 },
          },
        }
      : {}),
    tooltip: { trigger: data.type === 'pie' || data.type === 'scatter' ? 'item' : 'axis' },
    ...(data.series.length > 1 || data.type === 'pie'
      ? {
          legend: {
            bottom: 0,
            textStyle: { color: colors.subtleText, fontSize: 11 },
          },
        }
      : {}),
  }

  if (data.type === 'pie') {
    const values = data.series[0]?.data ?? []
    return {
      ...base,
      series: [
        {
          type: 'pie',
          radius: ['38%', '68%'],
          center: ['50%', '48%'],
          label: { color: colors.subtleText, fontSize: 11 },
          data: values.map((value, index) => ({
            name: data.labels?.[index] ?? `Item ${index + 1}`,
            value: typeof value === 'number' ? value : value[1],
          })),
        },
      ],
    }
  }

  if (data.type === 'scatter') {
    return {
      ...base,
      grid: { left: 44, right: 20, top: data.title ? 40 : 20, bottom: 44 },
      xAxis: { type: 'value', ...axisCommon },
      yAxis: { type: 'value', ...axisCommon },
      series: data.series.map<SeriesOption>((entry, index) => ({
        type: 'scatter',
        name: entry.name ?? `Series ${index + 1}`,
        symbolSize: 8,
        data: entry.data.map((point, pointIndex) =>
          typeof point === 'number' ? [pointIndex, point] : point
        ),
      })),
    }
  }

  const categories =
    data.labels ??
    Array.from(
      { length: Math.max(...data.series.map((entry) => entry.data.length)) },
      (_, index) => `${index + 1}`
    )

  return {
    ...base,
    grid: {
      left: 44,
      right: 20,
      top: data.title ? 40 : 20,
      bottom: data.series.length > 1 ? 52 : 32,
    },
    xAxis: { type: 'category', data: categories, ...axisCommon },
    yAxis: { type: 'value', ...axisCommon },
    series: data.series.map<SeriesOption>((entry, index) => ({
      type: data.type === 'bar' ? 'bar' : 'line',
      name: entry.name ?? `Series ${index + 1}`,
      smooth: data.type !== 'bar',
      ...(data.type === 'area' ? { areaStyle: { opacity: 0.18 } } : {}),
      ...(data.type === 'bar'
        ? { barMaxWidth: 28, itemStyle: { borderRadius: [3, 3, 0, 0] } }
        : {}),
      data: toCartesianData(entry),
    })),
  }
}

interface ChartDisplayProps {
  data: ChartTagData
  className?: string
}

/**
 * Renders a `<chart>` special tag inline in chat using ECharts. The library
 * is loaded on demand so chat bundles stay lean when no chart is present.
 */
export function ChartDisplay({ data, className }: ChartDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    let disposed = false
    let resizeObserver: ResizeObserver | null = null

    const render = async () => {
      const echarts = await import('echarts')
      if (disposed || !containerRef.current) return

      if (!chartRef.current) {
        chartRef.current = echarts.init(containerRef.current)
        resizeObserver = new ResizeObserver(() => chartRef.current?.resize())
        resizeObserver.observe(containerRef.current)
      }

      const colors = resolveThemeColors(containerRef.current)
      chartRef.current.setOption(buildOption(data, colors), { notMerge: true })
    }

    void render()

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [data])

  return (
    <div
      className={cn(
        'my-2 w-full rounded-lg border border-[var(--divider)] bg-[var(--surface-3)] p-2',
        className
      )}
    >
      <div
        ref={containerRef}
        className='h-[280px] w-full text-[var(--text-secondary)]'
        role='img'
        aria-label={data.title ?? 'Chart'}
      />
    </div>
  )
}
