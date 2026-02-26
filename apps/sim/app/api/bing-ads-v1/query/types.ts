/**
 * Type definitions for Bing Ads V1 API
 */

export interface BingAdsV1Request {
  query: string
  account: string
}

export interface BingAdsQueryResponse {
  reportType: string
  columns: string[]
  datePreset?: string
  timeRange?: {
    start: string
    end: string
  }
  aggregation?: string
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
