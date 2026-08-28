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
  adGroupFilter?: string // Filter to specific ad group name
  keywordFilter?: string // Filter to specific keyword / search term / ad title
}

export interface BingAdsReportRequest {
  reportType:
    | 'CampaignPerformance'
    | 'AdGroupPerformance'
    | 'KeywordPerformance'
    | 'AccountPerformance'
    | 'SearchQueryPerformance'
    | 'GeographicPerformance'
    | 'AdExtensionByAdReport'
    | 'AdExtensionDetailReport'
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

// V1 types for AI-powered query generation

export interface BingAdsV1Request {
  query: string
  account: string
  workspaceId?: string
}

export interface BingAdsQueryResponse {
  reportType: string
  columns: string[]
  datePreset?: string
  timeRange?: {
    start: string
    end: string
  }
  aggregation?: string
  query_type?: string
  tables_used?: string[]
  metrics_used?: string[]
  campaignFilter?: string
  adGroupFilter?: string
  keywordFilter?: string
}

export interface ProcessedResults {
  rows: any[]
  row_count: number
  total_rows: number
  totals?: Record<string, number>
}

export interface AIProviderConfig {
  provider: 'anthropic' | 'openai'
  model: string
  apiKey: string
  thinkingLevel?: string
}
