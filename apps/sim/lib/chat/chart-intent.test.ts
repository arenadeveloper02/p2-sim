import { describe, expect, it } from 'vitest'
import type { ChartSpec } from './chart-types'
import { applyChartIntent, parseChartIntent } from './chart-intent'

const sampleSpecs: ChartSpec[] = [
  {
    id: 'bar-spend',
    type: 'bar',
    title: 'Facebook Ads — Overview: Spend ($) by campaign',
    series: [{ name: 'Spend ($)', data: [100] }],
  },
  {
    id: 'bar-clicks',
    type: 'bar',
    title: 'Facebook Ads — Clicks by campaign',
    series: [{ name: 'Clicks', data: [50] }],
  },
  {
    id: 'pie-spend',
    type: 'pie',
    title: 'Facebook Ads: Spend ($) share',
    series: [{ name: 'Spend ($)', data: [{ name: 'A', value: 100 }] }],
  },
  {
    id: 'funnel',
    type: 'funnel',
    title: 'Facebook Ads funnel',
    series: [{ name: 'Expected', data: [{ name: 'Clicks', value: 50 }] }],
  },
]

describe('parseChartIntent', () => {
  it('returns default for full performance report listing many metrics', () => {
    const intent = parseChartIntent(
      'Show Facebook Ads performance for the last 7 days including reach, impressions, clicks, spend, CTR, CPC, and CPM by campaign'
    )
    expect(intent.mode).toBe('default')
    expect(intent.chartTypes).toEqual([])
  })

  it('returns default for generic performance query', () => {
    const intent = parseChartIntent('Give me performance for the last 7 days by campaign')
    expect(intent.mode).toBe('default')
  })

  it('returns default when metrics mentioned without chart type', () => {
    const intent = parseChartIntent('Give me clicks and CTR for the last 7 days')
    expect(intent.mode).toBe('default')
  })

  it('filters for pie chart request with metrics', () => {
    const intent = parseChartIntent('Give me ROAS and clicks in pie chart')
    expect(intent.mode).toBe('filtered')
    expect(intent.chartTypes).toContain('pie')
    expect(intent.metrics.length).toBeGreaterThan(0)
  })

  it('filters for only funnel', () => {
    const intent = parseChartIntent(
      'Give me clicks and CTR for last 7 days and only want this in funnel'
    )
    expect(intent.mode).toBe('filtered')
    expect(intent.chartTypes).toEqual(['funnel'])
  })

  it('filters for bar chart of spend', () => {
    const intent = parseChartIntent('Show me a bar chart of spend by campaign')
    expect(intent.mode).toBe('filtered')
    expect(intent.chartTypes).toContain('bar')
    expect(intent.metrics.some((m) => /spend/i.test(m))).toBe(true)
  })
})

describe('applyChartIntent', () => {
  it('returns all specs in default mode', () => {
    expect(applyChartIntent(sampleSpecs, { mode: 'default', chartTypes: [], metrics: [] })).toHaveLength(
      4
    )
  })

  it('returns only pie charts when requested', () => {
    const intent = parseChartIntent('pie chart of spend')
    const filtered = applyChartIntent(sampleSpecs, intent)
    expect(filtered.every((s) => s.type === 'pie')).toBe(true)
    expect(filtered.length).toBe(1)
  })

  it('returns only funnel when requested', () => {
    const intent = parseChartIntent('only funnel')
    const filtered = applyChartIntent(sampleSpecs, intent)
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.type).toBe('funnel')
  })
})
