/**
 * Type definitions for Google Ads V1 API
 */

export interface GoogleAdsV1Request {
  query: string
  accounts?: string
  customerId?: string
  managerCustomerId?: string
  developerToken?: string
  oauthCredential?: string
}

export interface GAQLResponse {
  gaql_query: string
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
  provider: 'xai' | 'openai' | 'anthropic' | 'google'
  model: string
  apiKey: string
}
