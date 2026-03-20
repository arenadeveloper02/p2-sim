import type { ToolResponse } from '@/tools/types'

export interface SemrushParams {
  reportType: string
  /** Set by block config; callers may send url or domain instead. */
  target?: string
  url?: string
  domain?: string
  database?: string
  displayLimit?: number | string
  exportColumns?: string
  additionalParams?: string // Raw query string for extra params
  apiKey?: string
}

export interface SemrushResponse extends ToolResponse {
  output: {
    reportType: string
    data: Array<Record<string, string>>
    columns: string[]
    totalRows: number
    rawCsv: string
  }
}

/** Params for Semrush Projects API – Organic Positions Report (Position Tracking). */
export interface SemrushOrganicPositionsParams {
  campaignId: string
  url: string
  dateBegin?: string
  dateEnd?: string
  linktypeFilter?: string
  displayTags?: string
  displayTagsCondition?: string
  displaySort?: string
  displayLimit?: number | string
  displayOffset?: number | string
  displayFilter?: string
  topFilter?: string
  useVolume?: 'national' | 'regional' | 'local'
  businessName?: string
  serpFeatureFilter?: string
  apiKey?: string
}

/** Raw API response for Organic Positions Report (data key is object of index -> row). */
export interface SemrushOrganicPositionsApiResponse {
  total: number
  state?: string
  limit: number
  offset: number
  data: Record<string, Record<string, unknown>>
}

export interface SemrushOrganicPositionsResponse extends ToolResponse {
  output: {
    reportType: 'tracking_position_organic'
    data: Array<Record<string, unknown>>
    totalRows: number
    limit: number
    offset: number
    raw: SemrushOrganicPositionsApiResponse
  }
}
