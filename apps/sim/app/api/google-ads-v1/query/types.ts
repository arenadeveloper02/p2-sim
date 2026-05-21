/**
 * Type definitions for Google Ads V1 API
 */

export interface GoogleAdsV1Request {
  query: string
  accounts: string
}

export interface GAQLResponse {
  skill: 'gaql'
  gaql_query: string
  query_type?: string
  tables_used?: string[]
  metrics_used?: string[]
}

export interface RSAHeadline {
  text: string
  charCount: number
  pinPosition?: string
  type?: string
}

export interface RSADescription {
  text: string
  charCount: number
}

export interface RSAResponse {
  skill: 'rsa'
  headlines: RSAHeadline[]
  descriptions: RSADescription[]
}

export type GoogleAdsRouterResponse = GAQLResponse | RSAResponse

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
