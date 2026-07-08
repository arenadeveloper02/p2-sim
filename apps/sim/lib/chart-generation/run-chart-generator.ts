import { buildEChartsOption } from '@/lib/chart-generation/build-echarts-option'
import { planChart } from '@/lib/chart-generation/plan-chart'
import { normalizeChartData, profileChartData } from '@/lib/chart-generation/profile-data'
import { renderChartHtml } from '@/lib/chart-generation/render-chart-html'
import type { ChartGeneratorOutput, ChartGeneratorParams } from '@/lib/chart-generation/types'

export function runChartGenerator(params: ChartGeneratorParams): ChartGeneratorOutput {
  const warnings: string[] = []
  const rows = normalizeChartData(params.data, params.dataPath)

  if (rows.length === 0) {
    throw new Error(
      'No chartable data found. Provide JSON rows, an array of objects, or a nested data path.'
    )
  }

  const profile = profileChartData(rows)
  if (profile.rowCount > 5000) {
    warnings.push(`Large dataset (${profile.rowCount} rows). Values were aggregated for rendering.`)
  }

  const plan = planChart({
    prompt: params.prompt,
    profile,
    chartType: params.chartType,
    title: params.title,
  })

  const option = buildEChartsOption(profile.rows, plan)
  const width = params.width && params.width > 0 ? params.width : 800
  const height = params.height && params.height > 0 ? params.height : 500
  const htmlContent = renderChartHtml(option, width, height)
  const outputFormat = params.outputFormat ?? 'both'
  const includeHtml = outputFormat === 'html' || outputFormat === 'both'
  const includeOption = outputFormat === 'option' || outputFormat === 'both'

  const html = includeHtml
    ? {
        name: 'chart.html',
        mimeType: 'text/html',
        data: Buffer.from(htmlContent, 'utf-8'),
      }
    : ''

  return {
    option: includeOption ? option : {},
    chartType: plan.chartType,
    title: plan.title ?? 'Generated Chart',
    html,
    metadata: {
      rowCount: profile.rowCount,
      fields: profile.fields.map((field) => field.name),
      xField: plan.xField,
      yFields: plan.yFields,
      warnings,
    },
  }
}
