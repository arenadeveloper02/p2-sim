/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { resolveEChartsOptionsFromContent } from '@/lib/chart-generation/echarts-option'
import { resolveChartContentFromFinalOutput } from '@/lib/chart-generation/resolve-final-output-chart'

const BLOCK_ID = 'chartgen1'

// A real line + trendline ECharts option (multiple line series incl. a dashed trendline).
const lineTrendlineOption = {
  title: { text: 'Daily Spend vs Conversions & Efficiency Trend', left: 'center' },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: ['2026-06-01', '2026-06-02', '2026-06-03'] },
  yAxis: [
    { type: 'value', name: 'Spend ($)', position: 'left' },
    { type: 'value', name: 'Conversions', position: 'right' },
    { type: 'value', name: 'Conversions per $', position: 'right', offset: 64 },
  ],
  series: [
    { name: 'Spend ($)', type: 'line', yAxisIndex: 0, data: [41.91, 60.48, 44.01] },
    { name: 'Total Conversions', type: 'line', yAxisIndex: 1, data: [12.01, 18.57, 18.43] },
    { name: 'Conversion Efficiency', type: 'line', yAxisIndex: 2, data: [0.28, 0.3, 0.41] },
    {
      name: 'Efficiency Trendline',
      type: 'line',
      yAxisIndex: 2,
      symbol: 'none',
      lineStyle: { type: 'dashed', width: 2 },
      data: [0.46, 0.45, 0.44],
    },
  ],
  warnings: ['Efficiency is conversions divided by spend; dashed line is a linear trend.'],
}

const contentString = JSON.stringify(lineTrendlineOption)

function expectRenderable(chartContent: string | null) {
  expect(chartContent).not.toBeNull()
  const options = resolveEChartsOptionsFromContent(chartContent as string)
  expect(options).not.toBeNull()
  expect(options!.length).toBeGreaterThan(0)
  expect(options![0].series.length).toBe(4)
}

describe('resolveChartContentFromFinalOutput', () => {
  it('recovers the chart from a block-id-keyed output via selected outputs', () => {
    const finalOutput = { [BLOCK_ID]: { content: contentString } }
    const result = resolveChartContentFromFinalOutput(finalOutput, [`${BLOCK_ID}_content`])
    expectRenderable(result)
  })

  it('recovers the chart from the aggregated terminal output (top-level charts/content)', () => {
    const finalOutput = {
      charts: [lineTrendlineOption],
      count: 1,
      valid: true,
      content: contentString,
      dashboard: { charts: [lineTrendlineOption], count: 1 },
    }
    // No selected outputs available (fallback path).
    const result = resolveChartContentFromFinalOutput(finalOutput, [])
    expectRenderable(result)
  })

  it('recovers the chart from a lone { content } object', () => {
    const finalOutput = { content: contentString }
    const result = resolveChartContentFromFinalOutput(finalOutput, [])
    expectRenderable(result)
  })

  it('recovers the chart by scanning object values when the block id does not match', () => {
    const finalOutput = { someOtherKey: { content: contentString } }
    const result = resolveChartContentFromFinalOutput(finalOutput, ['unknownblock_content'])
    expectRenderable(result)
  })

  it('returns null for text-only output (no regression on plain responses)', () => {
    expect(resolveChartContentFromFinalOutput({ content: 'just a summary, no chart' }, [])).toBeNull()
    expect(resolveChartContentFromFinalOutput('hello world', [])).toBeNull()
    expect(resolveChartContentFromFinalOutput(null, [])).toBeNull()
    expect(resolveChartContentFromFinalOutput(undefined, [])).toBeNull()
  })
})

// Proves the resolver is chart-type-agnostic: any prompt that yields any ECharts
// series type is recovered through the exact same generic path (no per-type code).
describe('resolveChartContentFromFinalOutput - any chart type (dynamic)', () => {
  const optionForType = (type: string) => ({
    title: { text: `${type} chart` },
    series: [{ name: 'S', type, data: [{ name: 'A', value: 1 }, { name: 'B', value: 2 }] }],
  })

  const chartTypes = ['bar', 'line', 'pie', 'funnel', 'scatter', 'radar', 'heatmap', 'gauge']

  for (const type of chartTypes) {
    it(`recovers a "${type}" chart from terminal output`, () => {
      const option = optionForType(type)
      const finalOutput = {
        charts: [option],
        count: 1,
        valid: true,
        content: JSON.stringify(option),
      }
      const result = resolveChartContentFromFinalOutput(finalOutput, [])
      expect(result).not.toBeNull()
      const options = resolveEChartsOptionsFromContent(result as string)
      expect(options).not.toBeNull()
      expect(options![0].series[0].type).toBe(type)
    })

    it(`recovers a "${type}" chart from a block-id-keyed { content } via selected output`, () => {
      const option = optionForType(type)
      const finalOutput = { [BLOCK_ID]: { content: JSON.stringify(option) } }
      const result = resolveChartContentFromFinalOutput(finalOutput, [`${BLOCK_ID}_content`])
      expect(result).not.toBeNull()
      const options = resolveEChartsOptionsFromContent(result as string)
      expect(options![0].series[0].type).toBe(type)
    })
  }
})
