/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { normalizeChartOutput } from '@/lib/chart-generation/normalize-chart-output'

const singleOption = {
  title: { text: 'Revenue' },
  xAxis: { type: 'category', data: ['Jan', 'Feb'] },
  yAxis: { type: 'value' },
  series: [{ name: 'revenue', type: 'bar', data: [100, 120] }],
}

const secondOption = {
  title: { text: 'Trend' },
  xAxis: { type: 'category', data: ['Jan', 'Feb'] },
  yAxis: { type: 'value' },
  series: [{ name: 'revenue', type: 'line', data: [100, 120] }],
}

describe('normalizeChartOutput', () => {
  it('normalizes a single bare option object', () => {
    const raw = JSON.stringify(singleOption)
    const result = normalizeChartOutput(raw)

    expect(result.count).toBe(1)
    expect(result.charts).toEqual([singleOption])
    expect(result.content).toBe(JSON.stringify({ charts: [singleOption], count: 1 }))
  })

  it('normalizes a bare array of option objects', () => {
    const raw = JSON.stringify([singleOption, secondOption])
    const result = normalizeChartOutput(raw)

    expect(result.count).toBe(2)
    expect(result.charts).toEqual([singleOption, secondOption])
    expect(result.content).toBe(
      JSON.stringify({ charts: [singleOption, secondOption], count: 2 })
    )
  })

  it('strips a surrounding fenced code block', () => {
    const raw = '```json\n' + JSON.stringify(singleOption) + '\n```'
    const result = normalizeChartOutput(raw)

    expect(result.count).toBe(1)
    expect(result.charts).toEqual([singleOption])
  })

  it('returns plain text when parsing fails', () => {
    const raw = 'No chartable data is available.'
    const result = normalizeChartOutput(raw)

    expect(result.charts).toEqual([])
    expect(result.count).toBe(0)
    expect(result.content).toBe(raw)
  })

  it('returns plain text when JSON is not a chart shape', () => {
    const raw = JSON.stringify({ message: 'hello' })
    const result = normalizeChartOutput(raw)

    expect(result.charts).toEqual([])
    expect(result.count).toBe(0)
    expect(result.content).toBe(raw)
  })
})
