// Google Ads helper types

export interface SitelinkQuery {
  account?: string
  campaign?: string
  intent: 'sitelinks'
  timeframe?: string
}

export interface SitelinkData {
  level: string
  campaign_name: string
  ad_group_name?: string | null
  sitelink_text: string
  description1?: string
  description2?: string
  clicks: number
  impressions: number
  ctr: number
  cost: number
}

export interface SitelinkResponse {
  account: string
  campaign?: string
  sitelinks: SitelinkData[]
  insights: {
    best_performing: string
    worst_performing: string
    recommendations: string[]
  }
}

export interface GTMQuery {
  focus: 'gtm_metrics'
  metrics: string[]
  timeframe: string
  format: string
}

export interface GTMResponse {
  view_mode: 'gtm_metrics'
  executive_summary: {
    total_revenue_generated: number
    average_roas: number
    month_over_month_growth: number
    top_performing_accounts: string[]
    at_risk_accounts: string[]
  }
}
