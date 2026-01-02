export interface DateRange {
  start: string
  end: string
}

export interface BingAdsRequest {
  account: string
  query: string
  date_preset?: string
  time_range?: {
    start: string
    end: string
  }
}

export interface BingAdsResponse {
  success: boolean
  data: any
  account_id: string
  account_name: string
  query: string
  requestId: string
  timestamp: string
  date_range?: {
    start: string
    end: string
  }
}

export interface ParsedBingQuery {
  reportType: string
  columns: string[]
  datePreset?: string
  timeRange?: {
    start: string
    end: string
  }
  filters?: any[]
  aggregation?: string
  campaignFilter?: string // Filter to specific campaign name
}

export interface BingAdsReportRequest {
  reportType: 'CampaignPerformance' | 'AdGroupPerformance' | 'KeywordPerformance' | 'AccountPerformance'
  columns: string[]
  scope: {
    accountIds: string[]
    campaigns?: string[]
    adGroups?: string[]
  }
  time: {
    customDateRangeStart?: { day: number; month: number; year: number }
    customDateRangeEnd?: { day: number; month: number; year: number }
    predefinedTime?: string
  }
}
