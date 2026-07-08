import type {
  ChartAggregation,
  ChartPlan,
  ChartType,
  ChartTypeInput,
  DataProfile,
  FieldProfile,
} from '@/lib/chart-generation/types'

const CHART_TYPE_KEYWORDS: Record<ChartType, string[]> = {
  bar: ['bar', 'column', 'histogram', 'compare', 'comparison'],
  line: ['line', 'trend', 'time series', 'over time', 'timeline', 'growth'],
  pie: ['pie', 'donut', 'share', 'distribution', 'breakdown', 'proportion', 'percentage'],
  scatter: ['scatter', 'correlation', 'relationship', 'versus', ' vs '],
  area: ['area', 'filled', 'stacked area'],
}

function detectChartTypeFromPrompt(prompt: string): ChartType | undefined {
  const normalized = prompt.toLowerCase()
  for (const [chartType, keywords] of Object.entries(CHART_TYPE_KEYWORDS) as [ChartType, string[]][]) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return chartType
    }
  }
  return undefined
}

function pickCategoryField(fields: FieldProfile[]): FieldProfile | undefined {
  return (
    fields.find((field) => field.kind === 'date') ??
    fields.find((field) => field.kind === 'string' && field.uniqueCount > 1) ??
    fields.find((field) => field.kind === 'string')
  )
}

function pickNumericFields(fields: FieldProfile[]): FieldProfile[] {
  return fields.filter((field) => field.kind === 'number')
}

function pickGroupField(fields: FieldProfile[], xField?: string): FieldProfile | undefined {
  return fields.find(
    (field) =>
      field.name !== xField &&
      field.kind === 'string' &&
      field.uniqueCount > 1 &&
      field.uniqueCount <= Math.max(12, fields.length)
  )
}

function inferDefaultChartType(
  profile: DataProfile,
  xField: FieldProfile,
  yFields: FieldProfile[],
  groupField: FieldProfile | undefined,
  prompt: string
): ChartType {
  const promptType = detectChartTypeFromPrompt(prompt)
  if (promptType) {
    return promptType
  }

  if (yFields.length >= 2 && xField.kind === 'number') {
    return 'scatter'
  }

  if (
    groupField &&
    xField.kind === 'string' &&
    xField.uniqueCount <= 8 &&
    /share|distribution|breakdown|proportion/i.test(prompt)
  ) {
    return 'pie'
  }

  if (xField.kind === 'date' || DATE_LIKE.test(xField.name)) {
    return 'line'
  }

  if (groupField && xField.uniqueCount > 1) {
    return 'bar'
  }

  if (xField.uniqueCount <= 8 && yFields.length === 1) {
    return 'pie'
  }

  return 'bar'
}

const DATE_LIKE = /^(date|time|timestamp|datetime|month|year|week|day|created|updated|period)$/i

function inferAggregation(prompt: string, chartType: ChartType): ChartAggregation {
  const normalized = prompt.toLowerCase()
  if (normalized.includes('average') || normalized.includes('avg')) return 'avg'
  if (normalized.includes('count')) return 'count'
  if (normalized.includes('max') || normalized.includes('maximum')) return 'max'
  if (normalized.includes('min') || normalized.includes('minimum')) return 'min'
  if (normalized.includes('total') || normalized.includes('sum')) return 'sum'
  return chartType === 'pie' ? 'sum' : 'none'
}

function buildTitle(prompt: string, titleOverride?: string): string {
  const trimmedOverride = titleOverride?.trim()
  if (trimmedOverride) {
    return trimmedOverride
  }

  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) {
    return 'Generated Chart'
  }

  return trimmedPrompt.length > 80 ? `${trimmedPrompt.slice(0, 77)}...` : trimmedPrompt
}

export function planChart(input: {
  prompt: string
  profile: DataProfile
  chartType?: ChartTypeInput
  title?: string
}): ChartPlan {
  const { prompt, profile, chartType = 'auto', title } = input

  if (profile.rowCount === 0 || profile.fields.length === 0) {
    throw new Error('No chartable data found. Provide an array of objects or tabular JSON.')
  }

  const numericFields = pickNumericFields(profile.fields)
  if (numericFields.length === 0) {
    throw new Error('No numeric fields found in the data. Charts require at least one numeric value.')
  }

  const xField = pickCategoryField(profile.fields) ?? profile.fields[0]
  const yFields = numericFields.map((field) => field.name).slice(0, 5)
  const groupField = pickGroupField(profile.fields, xField.name)

  const resolvedChartType =
    chartType === 'auto'
      ? inferDefaultChartType(profile, xField, numericFields, groupField, prompt)
      : chartType

  const aggregation = inferAggregation(prompt, resolvedChartType)
  const stacked = /stacked/i.test(prompt) && resolvedChartType !== 'pie'

  return {
    chartType: resolvedChartType,
    title: buildTitle(prompt, title),
    xField: xField.name,
    yFields,
    ...(groupField && resolvedChartType !== 'pie' ? { groupBy: groupField.name } : {}),
    aggregation,
    stacked,
    showLegend: Boolean(groupField) || yFields.length > 1,
  }
}
