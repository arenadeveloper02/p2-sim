import type { ToolResponse } from '@/tools/types'

export interface SemrushParams {
  reportType: string
  /** Set by block config; callers may send url or domain instead. */
  target?: string
  url?: string
  domain?: string
  database?: string
  displayLimit?: number | string
  exportColumns?: string
  additionalParams?: string // Raw query string for extra params
  apiKey?: string
}

export interface SemrushResponse extends ToolResponse {
  output: {
    reportType: string
    data: Array<Record<string, string>>
    columns: string[]
    totalRows: number
    rawCsv: string
  }
}
