import type { ChartAggregation, ChartPlan } from '@/lib/chart-generation/types'

function aggregateValues(values: number[], aggregation: ChartAggregation): number {
  if (values.length === 0) {
    return 0
  }

  switch (aggregation) {
    case 'sum':
    case 'none':
      return values.reduce((sum, value) => sum + value, 0)
    case 'avg':
      return values.reduce((sum, value) => sum + value, 0) / values.length
    case 'count':
      return values.length
    case 'max':
      return Math.max(...values)
    case 'min':
      return Math.min(...values)
    default:
      return values.reduce((sum, value) => sum + value, 0)
  }
}

function formatAxisValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  return String(value)
}

function buildGroupedRows(
  rows: Record<string, unknown>[],
  plan: ChartPlan
): Record<string, unknown>[] {
  const groups = new Map<string, Record<string, number[]>>()

  for (const row of rows) {
    const xValue = formatAxisValue(row[plan.xField])
    const groupKey = plan.groupBy ? formatAxisValue(row[plan.groupBy]) : '__single__'
    const bucketKey = `${xValue}::${groupKey}`
    const bucket = groups.get(bucketKey) ?? {}

    for (const yField of plan.yFields) {
      const rawValue = row[yField]
      const numericValue =
        typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : Number(rawValue)
      if (!Number.isFinite(numericValue)) {
        continue
      }
      bucket[yField] = bucket[yField] ?? []
      bucket[yField].push(numericValue)
    }

    groups.set(bucketKey, bucket)
  }

  const aggregated = new Map<string, Record<string, unknown>>()
  for (const [bucketKey, bucket] of groups.entries()) {
    const [xValue, groupValue] = bucketKey.split('::')
    const rowKey = plan.groupBy ? `${xValue}::${groupValue}` : xValue
    const existing = aggregated.get(rowKey) ?? {
      [plan.xField]: xValue,
      ...(plan.groupBy ? { [plan.groupBy]: groupValue === '__single__' ? '' : groupValue } : {}),
    }

    for (const yField of plan.yFields) {
      existing[yField] = aggregateValues(bucket[yField] ?? [], plan.aggregation)
    }

    aggregated.set(rowKey, existing)
  }

  return [...aggregated.values()]
}

function uniqueOrdered(values: string[]): string[] {
  return [...new Set(values)]
}

export function buildEChartsOption(
  rows: Record<string, unknown>[],
  plan: ChartPlan
): Record<string, unknown> {
  const preparedRows = buildGroupedRows(rows, plan)

  if (plan.chartType === 'scatter') {
    const xField =
      preparedRows.every((row) => Number.isFinite(Number(row[plan.xField])))
        ? plan.xField
        : plan.yFields[0]
    const yField = plan.yFields.find((field) => field !== xField) ?? plan.yFields[0]

    return {
      title: { text: plan.title, left: 'center' },
      tooltip: { trigger: 'item' },
      legend: plan.showLegend ? { top: 28 } : undefined,
      grid: { left: 48, right: 24, top: plan.showLegend ? 72 : 56, bottom: 48 },
      xAxis: { type: 'value', name: xField },
      yAxis: { type: 'value', name: yField },
      series: [
        {
          name: `${xField} vs ${yField}`,
          type: 'scatter',
          data: preparedRows.map((row) => [Number(row[xField]) || 0, Number(row[yField]) || 0]),
        },
      ],
    }
  }

  if (plan.chartType === 'pie') {
    const yField = plan.yFields[0]
    const pieData = preparedRows.map((row) => ({
      name: formatAxisValue(row[plan.xField]),
      value: Number(row[yField]) || 0,
    }))

    return {
      title: { text: plan.title, left: 'center' },
      tooltip: { trigger: 'item' },
      legend: plan.showLegend ? { orient: 'vertical', left: 'left' } : undefined,
      series: [
        {
          type: 'pie',
          radius: '60%',
          data: pieData,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    }
  }

  const categories = uniqueOrdered(preparedRows.map((row) => formatAxisValue(row[plan.xField])))
  const groupValues = plan.groupBy
    ? uniqueOrdered(preparedRows.map((row) => formatAxisValue(row[plan.groupBy as string])))
    : []

  const series =
    plan.groupBy && groupValues.length > 0
      ? groupValues.flatMap((groupValue) =>
          plan.yFields.map((yField) => ({
            name: `${groupValue} ${yField}`,
            type: plan.chartType === 'area' ? 'line' : plan.chartType,
            stack: plan.stacked ? 'total' : undefined,
            areaStyle: plan.chartType === 'area' ? {} : undefined,
            data: categories.map((category) => {
              const match = preparedRows.find(
                (row) =>
                  formatAxisValue(row[plan.xField]) === category &&
                  formatAxisValue(row[plan.groupBy as string]) === groupValue
              )
              return match ? Number(match[yField]) || 0 : 0
            }),
          }))
        )
      : plan.yFields.map((yField) => ({
          name: yField,
          type: plan.chartType === 'area' ? 'line' : plan.chartType,
          stack: plan.stacked ? 'total' : undefined,
          areaStyle: plan.chartType === 'area' ? {} : undefined,
          data: categories.map((category) => {
            const match = preparedRows.find((row) => formatAxisValue(row[plan.xField]) === category)
            return match ? Number(match[yField]) || 0 : 0
          }),
        }))

  return {
    title: { text: plan.title, left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: plan.showLegend ? { top: 28 } : undefined,
    grid: { left: 48, right: 24, top: plan.showLegend ? 72 : 56, bottom: 48 },
    xAxis: {
      type: 'category',
      data: categories,
      boundaryGap: plan.chartType === 'bar',
    },
    yAxis: {
      type: 'value',
    },
    series,
  }
}
