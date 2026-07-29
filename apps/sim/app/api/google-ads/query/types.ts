export interface GoogleAdsRequest {
  query: string
  accounts: string
  workspaceId?: string
  period_type?: string
  output_format?: string
  sort_by?: string
  custom_start_date?: string
  custom_end_date?: string
}

export interface Campaign {
  name: string
  status: string
  clicks: number
  impressions: number
  cost: number
  conversions: number
  conversions_value: number
  ctr: number
  avg_cpc: number
  cost_per_conversion: number
  conversion_rate: number
  impression_share: number
  budget_lost_share: number
  rank_lost_share: number
  roas: number
}

export interface AccountResult {
  account_id: string
  account_name: string
  campaigns: Campaign[]
  result: any[]
  gaqlQuery: string
  total_campaigns: number
  account_totals: {
    clicks: number
    impressions: number
    cost: number
    conversions: number
    conversions_value: number
    ctr: number
    avg_cpc: number
    conversion_rate: number
    cost_per_conversion: number
  }
  error?: string
}

export interface GaqlQueryResult {
  gaqlQuery: string
  periodType: string
  queryType: string
  startDate: string
  endDate: string
  isComparison?: boolean
  comparisonQuery?: string
  comparisonStartDate?: string
  comparisonEndDate?: string
  /** LLM cost from query generation (for tool output → span billing). */
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

export interface ProcessedResults {
  result: any[]
  campaigns: Campaign[]
  gaqlQuery: string
  accountTotals: {
    clicks: number
    impressions: number
    cost: number
    conversions: number
    conversions_value: number
  }
}
