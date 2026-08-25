export interface BingAdsAccount {
  id: string
  name: string
}

export interface BingAdsQueryParams {
  account: string
  query: string
}

export interface BingAdsResponse {
  success: boolean
  data: any
  account_id: string
  account_name: string
  query: string
  requestId: string
  timestamp: string
}

export interface BingAdsQueryResult {
  campaigns?: any[]
  account_totals?: {
    clicks: number
    impressions: number
    spend: number
    conversions: number
    ctr: number
    avg_cpc: number
  }
  date_range?: {
    start: string
    end: string
  }
}
