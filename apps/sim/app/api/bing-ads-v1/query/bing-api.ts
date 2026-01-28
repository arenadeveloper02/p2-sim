/**
 * Bing Ads API Request Handler - Adapted from current Bing Ads but simplified
 */

import { createLogger } from '@/lib/logs/console/logger'
import type { ParsedBingQuery } from '../../bing-ads/query/types'

const logger = createLogger('BingAdsV1API')

// NEW function for search queries - uses SearchQuery field instead of CampaignName
function buildSearchQueryMetrics(rows: Array<Record<string, any>>, parsedQuery: ParsedBingQuery): any {
  const searchQueriesByName = new Map<string, any>()

  for (const row of rows) {
    // Use SearchQuery for search query reports
    const name = String(row.SearchQuery || '').trim()
    
    if (!name) continue

    const impressions = toNumber(row.Impressions)
    const clicks = toNumber(row.Clicks)
    const spend = toNumber(row.Spend)
    const conversions = toNumber(row.Conversions)

    const entityName = name
    const existing = searchQueriesByName.get(entityName) || {
      id: undefined, // Search queries don't have IDs in the same way
      name: entityName,
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
    }

    existing.impressions += impressions
    existing.clicks += clicks
    existing.spend += spend
    existing.conversions += conversions

    searchQueriesByName.set(entityName, existing)
  }

  const searchQueries = Array.from(searchQueriesByName.values()).map((c) => {
    const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0
    const avgCpc = c.clicks > 0 ? c.spend / c.clicks : 0
    const costPerConversion = c.conversions > 0 ? c.spend / c.conversions : 0
    return {
      ...c,
      ctr,
      avg_cpc: avgCpc,
      cost_per_conversion: costPerConversion,
    }
  })

  // If no search queries found but we have rows, calculate totals directly from rows
  let totals = { impressions: 0, clicks: 0, spend: 0, conversions: 0 }
  
  if (searchQueries.length > 0) {
    totals = searchQueries.reduce(
      (acc, c) => {
        acc.impressions += c.impressions
        acc.clicks += c.clicks
        acc.spend += c.spend
        acc.conversions += c.conversions
        return acc
      },
      { impressions: 0, clicks: 0, spend: 0, conversions: 0 }
    )
  } else if (rows.length > 0) {
    // Fallback: calculate totals directly from rows
    for (const row of rows) {
      totals.impressions += toNumber(row.Impressions)
      totals.clicks += toNumber(row.Clicks)
      totals.spend += toNumber(row.Spend)
      totals.conversions += toNumber(row.Conversions)
    }
  }

  const totalCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
  const totalAvgCpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0
  const totalCostPerConversion = totals.conversions > 0 ? totals.spend / totals.conversions : 0

  return {
    campaigns: searchQueries, // Keep same structure for compatibility
    account_totals: {
      ...totals,
      ctr: totalCtr,
      avg_cpc: totalAvgCpc,
      cost_per_conversion: totalCostPerConversion,
    },
    report_type: parsedQuery.reportType,
    date_preset: parsedQuery.datePreset,
    aggregation: parsedQuery.aggregation,
    columns_requested: parsedQuery.columns,
  }
}

// Helper function to calculate totals from raw CSV rows
function calculateRawTotals(rows: Array<Record<string, any>>): any {
  if (!rows.length) {
    return {
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      cost: 0,
      ctr: 0,
      avg_cpc: 0,
      cost_per_conversion: 0
    }
  }

  let impressions = 0
  let clicks = 0
  let spend = 0
  let conversions = 0

  for (const row of rows) {
    impressions += toNumber(row.Impressions)
    clicks += toNumber(row.Clicks)
    spend += toNumber(row.Spend)
    conversions += toNumber(row.Conversions)
  }

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
  const avgCpc = clicks > 0 ? spend / clicks : 0
  const costPerConversion = conversions > 0 ? spend / conversions : 0

  return {
    impressions,
    clicks,
    spend,
    conversions,
    cost: 0,
    ctr,
    avg_cpc: avgCpc,
    cost_per_conversion: costPerConversion
  }
}

// Helper function to convert strings to numbers
function toNumber(value: any): number {
  if (value === null || value === undefined) return 0
  const cleaned = String(value).replace(/[^0-9.-]+/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

export interface BingAdsApiRequest {
  accountId: string
  reportType: string
  columns: string[]
  datePreset?: string
  timeRange?: {
    start: string
    end: string
  }
  aggregation?: string
  filters?: any[]
}

export interface BingAdsApiResponse {
  success: boolean
  data?: any
  rows?: any[]
  campaigns?: any[]  // Add campaigns field to support search query results
  account_totals?: any  // Add account_totals field
  report_type?: string
  date_preset?: string
  timeRange?: {
    start: string
    end: string
  }
  aggregation?: string
  columns_requested?: string[]
  error?: string
}

/**
 * Makes a request to Bing Ads API
 * 
 * @param request - Bing Ads API request parameters
 * @returns Promise resolving to Bing Ads API response
 */
export async function makeBingAdsRequest(request: BingAdsApiRequest): Promise<BingAdsApiResponse> {
  try {
    logger.info('Making Bing Ads API request', { 
      accountId: request.accountId,
      reportType: request.reportType,
      columnsCount: request.columns.length 
    })

    // Credentials are checked in the old Bing Ads API, no need to check here
    logger.info('Making actual Bing Ads API call', {
      reportType: request.reportType,
      accountId: request.accountId
    })

    // Use the same API logic as current Bing Ads
    // Import and use the real makeBingAdsRequest from current implementation
    const { makeBingAdsRequest: realBingAdsRequest } = await import('../../bing-ads/query/bing-ads-api')
    
    // Convert v1 request to old format ParsedBingQuery
    // Add required fields that the old API expects
    const enhancedColumns = [...request.columns]
    
    // Ensure AccountName and AccountId are always included (old API requirement)
    if (!enhancedColumns.includes('AccountName')) {
      enhancedColumns.unshift('AccountName')
    }
    if (!enhancedColumns.includes('AccountId')) {
      enhancedColumns.splice(1, 0, 'AccountId')
    }
    
    // For CampaignPerformance, ensure CampaignName and CampaignId are included
    if (request.reportType === 'CampaignPerformance') {
      if (!enhancedColumns.includes('CampaignName')) {
        enhancedColumns.push('CampaignName')
      }
      if (!enhancedColumns.includes('CampaignId')) {
        enhancedColumns.push('CampaignId')
      }
    }
    
    // Use timeRange if provided, otherwise fallback to datePreset
    const parsedQuery: ParsedBingQuery = {
      reportType: request.reportType,
      columns: enhancedColumns,
      timeRange: request.timeRange, // Use custom dates if provided
      filters: request.filters,
      datePreset: request.datePreset || 'Last30Days',
      aggregation: request.aggregation || 'Summary',
      campaignFilter: undefined
    }
    
    logger.info('Converted to ParsedBingQuery', { 
      parsedQuery,
      hasTimeRange: !!parsedQuery.timeRange,
      timeRangeStart: parsedQuery.timeRange?.start,
      timeRangeEnd: parsedQuery.timeRange?.end,
      datePreset: parsedQuery.datePreset
    })

    const apiResult = await realBingAdsRequest(request.accountId, parsedQuery)
    
    logger.info('Bing Ads API call completed', {
      success: apiResult.success,
      hasData: !!apiResult.data,
      hasError: !!apiResult.error,
      errorMessage: apiResult.error,
      rowsCount: apiResult.data?.length || 0,
      campaigns: apiResult.campaigns?.length || 0
    })

    // If this is a SearchQueryPerformance report and we got raw data, return it directly
    if (parsedQuery.reportType === 'SearchQueryPerformance' && apiResult.success && apiResult.data && Array.isArray(apiResult.data)) {
      logger.info('Processing SearchQueryPerformance with raw CSV data')
      
      // Return raw CSV data with ALL columns
      return {
        success: true,
        data: apiResult.data, // Return raw CSV rows with all columns
        campaigns: apiResult.data,
        account_totals: calculateRawTotals(apiResult.data),
        report_type: parsedQuery.reportType,
        date_preset: parsedQuery.datePreset,
        timeRange: parsedQuery.timeRange,
        aggregation: parsedQuery.aggregation,
        columns_requested: parsedQuery.columns
      }
    }

    // If this is a KeywordPerformance report and we got raw data, return it directly
    if (parsedQuery.reportType === 'KeywordPerformance' && apiResult.success && apiResult.data && Array.isArray(apiResult.data)) {
      logger.info('Processing KeywordPerformance with raw CSV data')
      
      // Return raw CSV data with ALL columns
      return {
        success: true,
        data: apiResult.data, // Return raw CSV rows with all columns
        campaigns: apiResult.data,
        account_totals: calculateRawTotals(apiResult.data),
        report_type: parsedQuery.reportType,
        date_preset: parsedQuery.datePreset,
        timeRange: parsedQuery.timeRange,
        aggregation: parsedQuery.aggregation,
        columns_requested: parsedQuery.columns
      }
    }

    return apiResult

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    logger.error('Bing Ads API request failed', { 
      errorMessage,
      errorStack,
      errorType: error?.constructor?.name,
      request 
    })
    
    return {
      success: false,
      error: errorMessage
    }
  }
}
