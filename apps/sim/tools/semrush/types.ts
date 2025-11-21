import type { ToolResponse } from '@/tools/types'

export interface SemrushParams {
  reportType: string
  target: string // URL or domain
  database?: string
  displayLimit?: number | string
  exportColumns?: string
  additionalParams?: string // Raw query string for extra params
  apiKey?: string
}

export interface SemrushResponse extends ToolResponse {
  output: {
    reportType: string
    data: Array<Record<string, string>> // Parsed CSV rows as objects
    columns: string[] // Column headers
    totalRows: number
    rawCsv?: string // Optional: include raw CSV for debugging
  }
}
