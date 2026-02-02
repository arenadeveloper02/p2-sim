/**
 * Bing Ads API Request Handler - Adapted from current Bing Ads but simplified
 */

console.log('=== BING-API.TS MODULE LOADED ===')

import type { ParsedBingQuery } from '../../bing-ads/query/types'

// Types for the API request/response
interface BingAdsApiRequest {
  accountId: string
  reportType: string
  columns: string[]
  timeRange?: { start: string; end: string }
  datePreset?: string
  filters?: any
  aggregation?: string
}

interface BingAdsApiResponse {
  success: boolean
  data?: any[]
  campaigns?: any[]
  error?: string
}

/**
 * Makes a request to Bing Ads API
 * 
 * @param request - Bing Ads API request parameters
 * @returns Promise resolving to Bing Ads API response
 */
export async function makeBingAdsRequest(request: BingAdsApiRequest): Promise<BingAdsApiResponse> {
  console.log('=== BING API V1 CALLED ===', { 
    accountId: request.accountId,
    reportType: request.reportType,
    timeRange: request.timeRange,
    datePreset: request.datePreset
  })
  
  try {
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
    
    // Debug: Log what we're receiving
    console.log('DEBUG: Bing API Request:', {
      originalTimeRange: request.timeRange,
      originalDatePreset: request.datePreset
    })

    // Use timeRange for dynamic dates - NEVER use datePreset
    const parsedQuery: ParsedBingQuery = {
      reportType: request.reportType,
      columns: enhancedColumns,
      timeRange: request.timeRange, // Always use custom dates
      filters: request.filters,
      datePreset: undefined, // NEVER use datePreset
      aggregation: request.aggregation || 'Summary',
      campaignFilter: undefined
    }

    // Debug: Log what we're sending to old API
    console.log('DEBUG: ParsedQuery for old API:', {
      accountId: request.accountId,
      reportType: parsedQuery.reportType,
      timeRange: parsedQuery.timeRange,
      datePreset: parsedQuery.datePreset,
      columns: parsedQuery.columns
    })
    
    // Debug date parsing
    if (parsedQuery.timeRange) {
      const startDay = parseInt(parsedQuery.timeRange.start.split('-')[2])
      const startMonth = parseInt(parsedQuery.timeRange.start.split('-')[1])
      const startYear = parseInt(parsedQuery.timeRange.start.split('-')[0])
      const endDay = parseInt(parsedQuery.timeRange.end.split('-')[2])
      const endMonth = parseInt(parsedQuery.timeRange.end.split('-')[1])
      const endYear = parseInt(parsedQuery.timeRange.end.split('-')[0])
      
      console.log('DEBUG: Date parsing:', {
        start: parsedQuery.timeRange.start,
        end: parsedQuery.timeRange.end,
        startDay, startMonth, startYear,
        endDay, endMonth, endYear
      })
    }
    
    console.log('DEBUG: Calling old Bing Ads API with:', parsedQuery)
    
    const apiResult = await realBingAdsRequest(request.accountId, parsedQuery)
    
    console.log('DEBUG: Old API result:', {
      success: apiResult?.success,
      hasData: !!apiResult?.data,
      dataLength: apiResult?.data?.length || 0,
      error: apiResult?.error
    })
    
    return apiResult
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}
