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
  timeRange?: {
    start: string
    end: string
  }
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

    // Get Bing Ads API credentials
    const clientId = process.env.BING_ADS_CLIENT_ID
    const clientSecret = process.env.BING_ADS_CLIENT_SECRET
    const refreshToken = process.env.BING_ADS_REFRESH_TOKEN
    const developerToken = process.env.BING_ADS_DEVELOPER_TOKEN

    if (!clientId || !clientSecret || !refreshToken || !developerToken) {
      throw new Error('Bing Ads API credentials not configured')
    }

    // Build report request
    const reportRequest = {
      ReportType: request.reportType,
      Format: 'Json',
      Language: 'English',
      ReportName: `Bing Ads Report - ${request.reportType}`,
      ReturnOnlyCompleteData: false,
      Columns: request.columns.map(col => ({ Name: col })),
      Scope: {
        AccountIds: [request.accountId],
        Campaigns: null,
        AdGroups: null
      },
      Time: request.timeRange ? {
        CustomDateRangeStart: {
          Day: parseInt(request.timeRange.start.split('-')[2]),
          Month: parseInt(request.timeRange.start.split('-')[1]),
          Year: parseInt(request.timeRange.start.split('-')[0])
        },
        CustomDateRangeEnd: {
          Day: parseInt(request.timeRange.end.split('-')[2]),
          Month: parseInt(request.timeRange.end.split('-')[1]),
          Year: parseInt(request.timeRange.end.split('-')[0])
        },
        PredefinedTime: null
      } : {
        PredefinedTime: 'Last30Days',
        CustomDateRangeStart: null,
        CustomDateRangeEnd: null
      }
    }

    // Make actual Bing Ads API call
    logger.info('Making actual Bing Ads API call', {
      reportType: request.reportType,
      accountId: request.accountId
    })

    // Use the same API logic as current Bing Ads
    // Import and use the real makeBingAdsRequest from current implementation
    const { makeBingAdsRequest: realBingAdsRequest } = await import('../../bing-ads/query/bing-ads-api')
    
    // Convert v1 request to old format ParsedBingQuery
    const parsedQuery: ParsedBingQuery = {
      reportType: request.reportType,
      columns: request.columns,
      timeRange: request.timeRange,
      filters: request.filters,
      datePreset: undefined,
      aggregation: undefined,
      campaignFilter: undefined
    }

    const apiResult = await realBingAdsRequest(request.accountId, parsedQuery)
    
    logger.info('Bing Ads API call completed', {
      success: apiResult.success,
      hasData: !!apiResult.data,
      rowsCount: apiResult.data?.length || 0
    })

    return apiResult

  } catch (error) {
    logger.error('Bing Ads API request failed', { error, request })
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
