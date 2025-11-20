// Intent types for query detection
export type Intent =
  | 'campaign_list'
  | 'performance'
  | 'demographics'
  | 'creative'
  | 'placement'
  | 'device'
  | 'adset'
  | 'ad'

export type PromptContext = Record<string, never>

export interface FacebookAdsRequest {
  query: string
  account: string
  date_preset?: string
  time_range?: { since: string; until: string }
  fields?: string[]
  level?: string
}

export interface ParsedFacebookQuery {
  endpoint: string
  fields: string[]
  date_preset?: string
  time_range?: { since: string; until: string }
  level?: string
  filters?: any
  breakdowns?: string[] // For demographics, device, placement breakdowns
}

export interface FacebookAdsResponse {
  success: boolean
  data?: any
  error?: string
  requestId: string
  account_id: string
  account_name: string
  query: string
  timestamp: string
}
