/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { bindChartData } from '@/lib/arena-generative-ui/bind-chart-data'

describe('bindChartData', () => {
  it('binds a record array with categoryField and series keys', () => {
    const bound = bindChartData(
      {
        chartType: 'line',
        statePath: 'daily',
        categoryField: 'date',
        series: 'spend, impressions',
        title: 'Spend by day',
      },
      {
        daily: [
          { date: 'Aug 4', spend: 6200, impressions: 110000 },
          { date: 'Aug 5', spend: 7100, impressions: 98000 },
        ],
      }
    )
    expect(bound.dsl).toMatchObject({
      title: 'Spend by day',
      chartType: 'line',
      categories: ['Aug 4', 'Aug 5'],
      series: [
        { name: 'spend', data: [6200, 7100] },
        { name: 'impressions', data: [110000, 98000] },
      ],
    })
  })

  it('falls back to name/label/date and numeric fields', () => {
    const bound = bindChartData(
      { chartType: 'bar', statePath: 'rows' },
      { rows: [{ label: 'Meta', spend: 31 }, { label: 'TikTok', spend: 17 }] }
    )
    expect(bound.dsl?.categories).toEqual(['Meta', 'TikTok'])
    expect(bound.dsl?.series).toEqual([{ name: 'spend', data: [31, 17] }])
  })

  it('binds a number array as a single series', () => {
    const bound = bindChartData({ chartType: 'line', statePath: 'orderVolume' }, {
      orderVolume: [1, 3, 2],
    })
    expect(bound.dsl?.categories).toEqual(['1', '2', '3'])
    expect(bound.dsl?.series).toEqual([{ name: 'Series', data: [1, 3, 2] }])
  })

  it('uses dummy categories and values when there is no statePath', () => {
    const bound = bindChartData({
      chartType: 'bar',
      categories: 'Mon, Tue',
      values: '10, 20',
      title: 'Spend',
    }, {})
    expect(bound.dsl).toMatchObject({
      chartType: 'bar',
      categories: ['Mon', 'Tue'],
      series: [{ name: 'Spend', data: [10, 20] }],
    })
  })

  it('returns empty when the path is missing', () => {
    const bound = bindChartData({ chartType: 'line', statePath: 'daily', emptyText: 'No rows' }, {})
    expect(bound.dsl).toBeNull()
    expect(bound.emptyText).toBe('No rows')
  })

  it('defaults chartType to line and clamps height', () => {
    const bound = bindChartData({ values: '1, 2', height: '900' }, {})
    expect(bound.dsl?.chartType).toBe('line')
    expect(bound.height).toBe(720)
  })
})
