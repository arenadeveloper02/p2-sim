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
  /** Admin workspace: account key from channel accounts. */
  account?: string
  workspaceId?: string
  /** Non-admin workspace: OAuth access token from connected Facebook Ads account. */
  accessToken?: string
  /** Non-admin workspace: ad account ID (act_123 or numeric). */
  accountId?: string
  adAccountId?: string
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
  /** LLM cost from query parsing (for tool output → span billing). */
  cost?: {
    input: number
    output: number
    total: number
  }
  model?: string
  tokens?: {
    input: number
    output: number
    total: number
  }
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
  cost?: {
    input: number
    output: number
    total: number
  }
  model?: string
  tokens?: {
    input: number
    output: number
    total: number
  }
}
