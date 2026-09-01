/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { buildConstrainedEChartsOption } from '@/lib/chart-generation/constrained-echarts-option'
import { isEChartsOption } from '@/lib/chart-generation/echarts-option'

const theme = {
  text: '#111',
  muted: '#666',
  border: '#ddd',
  brand: '#1a73e8',
}

describe('buildConstrainedEChartsOption', () => {
  it('builds a bar chart from categories and a single series', () => {
    const option = buildConstrainedEChartsOption(
      {
        title: 'Spend',
        chartType: 'bar',
        categories: ['Mon', 'Tue'],
        series: [{ name: 'spend', data: [10, 20] }],
        showLegend: false,
        stacked: false,
      },
      theme
    )
    expect(option).toBeTruthy()
    expect(isEChartsOption(option)).toBe(true)
    expect(option?.series[0]?.type).toBe('bar')
    expect(option?.xAxis).toMatchObject({ type: 'category', data: ['Mon', 'Tue'] })
  })

  it('builds a smooth line and an area series', () => {
    const line = buildConstrainedEChartsOption(
      {
        chartType: 'line',
        categories: ['A', 'B'],
        series: [{ name: 'n', data: [1, 2] }],
        showLegend: false,
        stacked: false,
      },
      theme
    )
    expect(line?.series[0]).toMatchObject({ type: 'line', smooth: true })

    const area = buildConstrainedEChartsOption(
      {
        chartType: 'area',
        categories: ['A', 'B'],
        series: [{ name: 'n', data: [1, 2] }],
        showLegend: false,
        stacked: true,
      },
      theme
    )
    expect(area?.series[0]).toMatchObject({ type: 'line', stack: 'total' })
    expect(area?.series[0]?.areaStyle).toEqual({ opacity: 0.18 })
  })

  it('builds a pie chart from the first series', () => {
    const option = buildConstrainedEChartsOption(
      {
        chartType: 'pie',
        categories: ['Meta', 'TikTok'],
        series: [{ name: 'spend', data: [31000, 17200] }],
        showLegend: true,
        stacked: false,
      },
      theme
    )
    expect(option?.series[0]?.type).toBe('pie')
    expect(option?.series[0]?.data).toEqual([
      { name: 'Meta', value: 31000 },
      { name: 'TikTok', value: 17200 },
    ])
    expect(isEChartsOption(option)).toBe(true)
  })

  it('returns null when there are no series', () => {
    expect(
      buildConstrainedEChartsOption(
        {
          chartType: 'bar',
          categories: ['A'],
          series: [],
          showLegend: false,
          stacked: false,
        },
        theme
      )
    ).toBeNull()
  })
})
