/**
 * Bing Ads V1 API Route
 * Handles Bing Ads queries with dynamic date calculation like Google Ads V1
 */

import { type NextRequest, NextResponse } from 'next/server'
import { BING_ADS_ACCOUNTS } from './constants'
import { generateBingAdsQuery } from './query-generation-simple'
import { makeBingAdsRequest } from './bing-api'
import { processResults } from './result-processing'
import type { BingAdsV1Request } from './types'


export async function POST(request: NextRequest): Promise<NextResponse<any>> {
  const startTime = Date.now()

  try {
    const body: BingAdsV1Request = await request.json()
    const { query, account } = body

    // Validate query
    if (!query) {
      return NextResponse.json({ error: 'No query provided' }, { status: 400 })
    }

    // Validate account
    if (!account) {
      return NextResponse.json({ error: 'No account provided' }, { status: 400 })
    }

    // Get account information
    const accountInfo = BING_ADS_ACCOUNTS[account]
    if (!accountInfo) {
      return NextResponse.json(
        {
          error: `Invalid account key: ${account}. Available accounts: ${Object.keys(BING_ADS_ACCOUNTS).join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Generate Bing Ads query using AI
    const queryResult = await generateBingAdsQuery(query)

    // Map dynamic timeRange to closest available preset
    function mapTimeRangeToPreset(timeRange: { start: string; end: string }): string {
      if (!timeRange || !timeRange.start || !timeRange.end) return 'Last30Days'
      
      const start = new Date(timeRange.start)
      const end = new Date(timeRange.end)
      const today = new Date()
      const daysDiff = Math.ceil((today.getTime() - end.getTime()) / (1000 * 60 * 60 * 24))
      const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
      
      // Map to closest preset
      if (rangeDays === 1) return 'Yesterday'
      if (rangeDays === 0) return 'Today'
      if (rangeDays <= 3) return 'Yesterday'
      if (rangeDays <= 7) return 'LastSevenDays'
      if (rangeDays <= 14) return 'Last14Days'
      return 'Last30Days'
    }

    // Execute the Bing Ads query against Bing Ads API
    const apiRequest = {
      accountId: accountInfo.id,
      reportType: queryResult.reportType,
      columns: queryResult.columns,
      timeRange: queryResult.timeRange,
      aggregation: queryResult.aggregation
    }
    
    // Map dynamic dates to preset for Bing Ads API
    const datePreset = mapTimeRangeToPreset(queryResult.timeRange || { start: '', end: '' })
    
    console.log('=== ROUTE CALLING BING API ===', {
      accountId: apiRequest.accountId,
      timeRange: apiRequest.timeRange,
      mappedPreset: datePreset,
      reportType: apiRequest.reportType
    })
    
    const { makeBingAdsRequest: realBingAdsRequest } = await import('../../bing-ads/query/bing-ads-api')
    
    const apiResult = await realBingAdsRequest(apiRequest.accountId, {
      reportType: apiRequest.reportType,
      columns: apiRequest.columns,
      timeRange: undefined, // Use preset instead of custom dates
      datePreset: datePreset, // Use mapped preset
      aggregation: apiRequest.aggregation,
      campaignFilter: undefined
    })
    
    console.log('=== ROUTE GOT API RESULT ===', {
      hasData: !!apiResult?.data,
      dataLength: apiResult?.data?.length || 0,
      success: apiResult?.success,
      error: apiResult?.error
    })

    // Process results
    const processedResults = processResults(apiResult, '')

    const executionTime = Date.now() - startTime

    // Build response - use AI's timeRange directly
    const response = {
      success: true,
      query: query,
      account: {
        id: accountInfo.id,
        name: accountInfo.name,
      },
      reportType: queryResult.reportType,
      columns: queryResult.columns,
      datePreset: null, // Always null when using dynamic dates
      timeRange: queryResult.timeRange, // Direct from AI
      query_type: queryResult.query_type,
      tables_used: queryResult.tables_used,
      metrics_used: queryResult.metrics_used,
      data: processedResults.rows,
      row_count: processedResults.row_count,
      total_rows: processedResults.total_rows,
      totals: processedResults.totals,
      execution_time_ms: executionTime,
    }

    return NextResponse.json(response)
  } catch (error) {
    const executionTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: 'Failed to process Bing Ads V1 query',
        suggestion: 'Please check your query and try again.',
        execution_time_ms: executionTime,
      },
      { status: 500 }
    )
  }
}
