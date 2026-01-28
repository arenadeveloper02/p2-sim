/**
 * Bing Ads API Request Handler - Adapted from current Bing Ads but simplified
 */

import { createLogger } from '@/lib/logs/console/logger'
import type { ParsedBingQuery } from '../../bing-ads/query/types'

const logger = createLogger('BingAdsV1API')

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
