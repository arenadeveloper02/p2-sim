/**
 * Type definitions for Google Analytics v1 API
 */

export interface GoogleAnalyticsV1Request {
  query: string
  property: string
}

export interface GA4QueryResponse {
  query: string
  dimensions: string[]
  metrics: string[]
  dateRanges: Array<{
    startDate: string
    endDate: string
  }>
  query_type?: string
  tables_used?: string[]
  metrics_used?: string[]
}

export interface ProcessedResults {
  rows: any[]
  row_count: number
  total_rows: number
  totals?: Record<string, number>
}

export interface AIProviderConfig {
  provider: 'xai' | 'openai'
  model: string
  apiKey: string
}

export interface GA4Property {
  id: string
  name: string
  displayName: string
}
