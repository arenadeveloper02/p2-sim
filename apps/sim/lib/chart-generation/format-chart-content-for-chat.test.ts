/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { formatChartContentForChat } from '@/lib/chart-generation/format-chart-content-for-chat'

const chartOption = {
  title: { text: 'CPC vs Conversion Rate' },
  xAxis: { type: 'value' },
  yAxis: { type: 'value' },
  series: [{ type: 'scatter', data: [[1, 2], [3, 4]] }],
}

describe('formatChartContentForChat', () => {
  it('returns normalized content string from graph generator block output', () => {
    const output = {
      charts: [chartOption],
      count: 1,
      content: JSON.stringify({ charts: [chartOption], count: 1 }),
      model: 'gpt-4o',
    }

    expect(formatChartContentForChat(output)).toBe(
      JSON.stringify({ charts: [chartOption], count: 1 })
    )
  })

  it('returns chart wrapper strings as-is', () => {
    const wrapper = JSON.stringify({ charts: [chartOption], count: 1 })
    expect(formatChartContentForChat(wrapper)).toBe(wrapper)
  })

  it('returns null for unrelated output', () => {
    expect(formatChartContentForChat({ foo: 'bar' })).toBeNull()
    expect(formatChartContentForChat('hello')).toBeNull()
  })
})
