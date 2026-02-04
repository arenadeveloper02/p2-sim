/**
 * Google Search Console API Types
 */

export interface GSCRequest {
  site: string
  query: string
}

export interface GSCQueryResponse {
  startDate: string
  endDate: string
  dimensions: string[]
  type: 'web' | 'discover' | 'googleNews' | 'news' | 'image' | 'video'
  dimensionFilterGroups?: DimensionFilterGroup[]
  aggregationType?: 'auto' | 'byPage' | 'byProperty'
  rowLimit?: number
  startRow?: number
}

export interface DimensionFilterGroup {
  groupType: 'and'
  filters: DimensionFilter[]
}

export interface DimensionFilter {
  dimension: 'country' | 'device' | 'page' | 'query' | 'searchAppearance'
  operator: 'contains' | 'equals' | 'notContains' | 'notEquals' | 'includingRegex' | 'excludingRegex'
  expression: string
}

export interface GSCResponse {
  rows: GSCRow[]
  responseAggregationType: 'auto' | 'byPage' | 'byProperty'
}

export interface GSCRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GSCQueryResult {
  site: string
  query: string
  startDate: string
  endDate: string
  dimensions: string[]
  type: string
  aggregationType: string
  data: GSCRow[]
  row_count: number
  totals: {
    clicks: number
    impressions: number
    avg_ctr: number
    avg_position: number
  }
}
