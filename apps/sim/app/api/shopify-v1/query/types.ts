/**
 * Type definitions for Shopify V1 API
 */

export interface ShopifyV1Request {
  query: string
  shopDomain: string
}

export interface GraphQLResponse {
  query: string
  query_type?: string
  entities_used?: string[]
  fields_used?: string[]
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
