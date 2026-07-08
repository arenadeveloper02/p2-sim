/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ChartGeneratorBlock } from '@/blocks/blocks/chart_generator'
import { buildEChartsOption } from '@/lib/chart-generation/build-echarts-option'
import { planChart } from '@/lib/chart-generation/plan-chart'
import { normalizeChartData, profileChartData } from '@/lib/chart-generation/profile-data'
import { runChartGenerator } from '@/lib/chart-generation/run-chart-generator'
import { chartGeneratorTool } from '@/tools/chart/generator'

describe('chart generation', () => {
  const sampleRows = [
    { month: 'Jan', revenue: 100, region: 'US' },
    { month: 'Feb', revenue: 120, region: 'US' },
    { month: 'Jan', revenue: 80, region: 'EU' },
    { month: 'Feb', revenue: 95, region: 'EU' },
  ]

  it('normalizes parallel array JSON into rows', () => {
    const rows = normalizeChartData({
      month: ['Jan', 'Feb'],
      revenue: [100, 120],
    })

    expect(rows).toEqual([
      { month: 'Jan', revenue: 100 },
      { month: 'Feb', revenue: 120 },
    ])
  })

  it('plans a line chart for time-like prompts', () => {
    const profile = profileChartData(sampleRows)
    const plan = planChart({
      prompt: 'Show revenue trend over time',
      profile,
      chartType: 'auto',
    })

    expect(plan.chartType).toBe('line')
    expect(plan.xField).toBe('month')
    expect(plan.yFields).toContain('revenue')
  })

  it('builds an ECharts option with series data', () => {
    const profile = profileChartData(sampleRows)
    const plan = planChart({
      prompt: 'Bar chart of revenue by month',
      profile,
      chartType: 'bar',
    })
    const option = buildEChartsOption(profile.rows, plan)

    expect(option.series).toBeDefined()
    expect(Array.isArray(option.xAxis)).toBe(false)
  })

  it('generates option and html output', () => {
    const result = runChartGenerator({
      prompt: 'Compare revenue by month',
      data: sampleRows,
      outputFormat: 'both',
    })

    expect(result.chartType).toBe('bar')
    expect(result.option.series).toBeDefined()
    expect(result.html).toMatchObject({
      name: 'chart.html',
      mimeType: 'text/html',
    })
  })
})

describe('ChartGeneratorBlock', () => {
  it('wires to chart_generator tool', () => {
    expect(ChartGeneratorBlock.tools?.access).toEqual(['chart_generator'])
    expect(ChartGeneratorBlock.tools?.config.tool?.({})).toBe('chart_generator')
  })

  it('requires prompt and data in params mapping', () => {
    expect(() =>
      ChartGeneratorBlock.tools?.config.params?.({
        prompt: '',
        data: [{ value: 1 }],
      })
    ).toThrow('Prompt is required')
  })
})

describe('chartGeneratorTool', () => {
  it('uses directExecution', async () => {
    const result = await chartGeneratorTool.directExecution?.({
      prompt: 'Revenue by month',
      data: [
        { month: 'Jan', revenue: 10 },
        { month: 'Feb', revenue: 20 },
      ],
      outputFormat: 'option',
    })

    expect(result?.success).toBe(true)
    expect(result?.output.option).toBeDefined()
  })
})
