import type { ToolResponse } from '@/tools/types'

export interface SemrushParams {
  /**
   * Block operation id (e.g. url_organic, domain_organic). Mirrors Exa-style tools
   * where the block + tool share the same field names; execution merges this from
   * `tool.operation` in agent flows.
   */
  operation?: string
  url?: string
  domain?: string
  database?: string
  displayLimit?: number | string
  exportColumns?: string
  additionalParams?: string
  apiKey?: string
  /** @deprecated Legacy tool/agent saves that used the raw API shape */
  reportType?: string
  /** @deprecated Legacy tool/agent saves */
  target?: string
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
