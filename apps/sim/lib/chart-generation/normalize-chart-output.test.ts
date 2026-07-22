import { describe, expect, it } from 'vitest'
import { normalizeChartOutput } from './normalize-chart-output'

const barOption = {
  title: { text: 'Spend by campaign' },
  xAxis: { type: 'category', data: ['A', 'B'] },
  yAxis: { type: 'value' },
  series: [{ name: 'Spend', type: 'bar', data: [100, 200] }],
}

describe('normalizeChartOutput', () => {
  it('normalizes dashboard wrapper', () => {
    const result = normalizeChartOutput({ charts: [barOption], count: 1 })
    expect(result.valid).toBe(true)
    expect(result.count).toBe(1)
    expect(result.skipped).toBe(false)
  })

  it('normalizes bare array from LLM', () => {
    const result = normalizeChartOutput([barOption])
    expect(result.valid).toBe(true)
    expect(result.count).toBe(1)
  })

  it('normalizes single bare option', () => {
    const result = normalizeChartOutput(barOption)
    expect(result.valid).toBe(true)
  })

  it('unwraps skill-style envelope', () => {
    const result = normalizeChartOutput({
      option: barOption,
      chartType: 'bar',
      title: 'Spend',
      html: '',
      metadata: { warnings: [] },
    })
    expect(result.valid).toBe(true)
    expect(result.count).toBe(1)
  })

  it('returns skipped for intentional empty payload', () => {
    const result = normalizeChartOutput({ charts: [], count: 0 })
    expect(result.skipped).toBe(true)
    expect(result.valid).toBe(false)
  })

  it('returns skipped for plain text', () => {
    const result = normalizeChartOutput('Total impressions: 101,827')
    expect(result.skipped).toBe(true)
    expect(result.valid).toBe(false)
  })

  it('accepts uncommon series types dynamically', () => {
    const result = normalizeChartOutput({
      charts: [
        {
          series: [{ type: 'themeRiver', data: [] }],
        },
      ],
      count: 1,
    })
    expect(result.valid).toBe(true)
  })
})
