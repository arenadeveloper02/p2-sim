/**
 * Type definitions for Google Ads V1 API
 */

export interface GoogleAdsV1Request {
  query: string
  /** Admin workspace: account key or numeric ID from GOOGLE_ADS_ACCOUNTS. */
  accounts?: string
  workspaceId?: string
  /** Non-admin workspace: OAuth access token from connected Google Ads account. */
  accessToken?: string
  accountId?: string
  customerId?: string
  developerToken?: string
  managerCustomerId?: string
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
