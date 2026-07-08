export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'area'

export type ChartTypeInput = ChartType | 'auto'

export type ChartOutputFormat = 'option' | 'html' | 'both'

export type ChartAggregation = 'none' | 'sum' | 'avg' | 'count' | 'max' | 'min'

export interface ChartPlan {
  chartType: ChartType
  title?: string
  xField: string
  yFields: string[]
  groupBy?: string
  aggregation: ChartAggregation
  stacked?: boolean
  showLegend?: boolean
}

export type FieldKind = 'number' | 'string' | 'date' | 'boolean' | 'unknown'

export interface FieldProfile {
  name: string
  kind: FieldKind
  uniqueCount: number
  sampleValues: unknown[]
}

export interface DataProfile {
  rows: Record<string, unknown>[]
  fields: FieldProfile[]
  rowCount: number
}

export interface ChartGeneratorParams {
  prompt: string
  data: unknown
  chartType?: ChartTypeInput
  outputFormat?: ChartOutputFormat
  title?: string
  dataPath?: string
  width?: number
  height?: number
}

export interface ChartGeneratorOutput {
  option: Record<string, unknown>
  chartType: ChartType
  title: string
  html: string | { name: string; mimeType: string; data: Buffer }
  metadata: {
    rowCount: number
    fields: string[]
    xField: string
    yFields: string[]
    warnings: string[]
  }
}
