/**
 * Bing Ads V1 API Route
 * Simplified, AI-powered Bing Ads query endpoint - Following Google Ads v1 pattern
 */

import { createLogger } from '@/lib/logs/console/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'
import { BING_ADS_ACCOUNTS } from './constants'
import { makeBingAdsRequest } from './bing-api'
import { generateBingAdsQuery } from './query-generation'
import { processResults } from './result-processing'
import type { BingAdsV1Request } from './types'

const logger = createLogger('BingAdsV1API')

/**
 * Convert date preset to actual date string
 */
function getDateFromPreset(preset: string, type: 'start' | 'end'): string {
  const today = new Date()
  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  switch (preset) {
    case 'Today':
      return formatDate(today)

    case 'Yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return formatDate(yesterday)
    }

    case 'LastSevenDays': {
      // Last 7 days excludes today, ends on yesterday
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)
      if (type === 'end') return formatDate(yesterday)
      const start = new Date(yesterday)
      start.setDate(yesterday.getDate() - 6)
      return formatDate(start)
    }

    case 'Last14Days': {
      // Last 14 days excludes today, ends on yesterday
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)
      if (type === 'end') return formatDate(yesterday)
      const start = new Date(yesterday)
      start.setDate(yesterday.getDate() - 13)
      return formatDate(start)
    }

    case 'Last30Days': {
      // Last 30 days excludes today, ends on yesterday
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)
      if (type === 'end') return formatDate(yesterday)
      const start = new Date(yesterday)
      start.setDate(yesterday.getDate() - 29)
      return formatDate(start)
    }

    case 'ThisWeek': {
      const dayOfWeek = today.getDay()
      const start = new Date(today)
      start.setDate(today.getDate() - dayOfWeek)
      if (type === 'start') return formatDate(start)
      return formatDate(today)
    }

    case 'LastWeek': {
      const dayOfWeek = today.getDay()
      const lastWeekEnd = new Date(today)
      lastWeekEnd.setDate(today.getDate() - dayOfWeek - 1)
      const lastWeekStart = new Date(lastWeekEnd)
      lastWeekStart.setDate(lastWeekEnd.getDate() - 6)
      if (type === 'start') return formatDate(lastWeekStart)
      return formatDate(lastWeekEnd)
    }

    case 'ThisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      if (type === 'start') return formatDate(start)
      return formatDate(today)
    }

    case 'LastMonth': {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      if (type === 'start') return formatDate(lastMonth)
      return formatDate(lastMonthEnd)
    }

    default:
      // Default to last 30 days
      if (type === 'end') return formatDate(today)
      const start = new Date(today)
      start.setDate(start.getDate() - 30)
      return formatDate(start)
  }
}

/**
 * POST /api/bing-ads-v1/query
 *
 * Handles Bing Ads V1 query requests
 *
 * Request body:
 * - query: Natural language query (e.g., "show campaign performance last 7 days")
 * - account: Account key from BING_ADS_ACCOUNTS
 *
 * Response:
 * - success: boolean
 * - query: Original user query
 * - account: Account information
 * - bing_query: Generated Bing Ads query
 * - results: Processed result rows
 * - totals: Aggregated metrics (if applicable)
 * - execution_time_ms: Total execution time
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    logger.info(`[${requestId}] Bing Ads V1 query request started`)

    // Parse request body
    const body: BingAdsV1Request = await request.json()
    logger.info(`[${requestId}] Request body received`, { body })

    const { query, account } = body

    // Validate query
    if (!query) {
      logger.error(`[${requestId}] No query provided in request`)
      return NextResponse.json({ error: 'No query provided' }, { status: 400 })
    }

    // Validate account
    if (!account) {
      logger.error(`[${requestId}] No account provided in request`)
      return NextResponse.json({ error: 'No account provided' }, { status: 400 })
    }

    // Get account information
    const accountInfo = BING_ADS_ACCOUNTS[account]
    if (!accountInfo) {
      logger.error(`[${requestId}] Invalid account key`, {
        account,
        availableAccounts: Object.keys(BING_ADS_ACCOUNTS),
      })
      return NextResponse.json(
        {
          error: `Invalid account key: ${account}. Available accounts: ${Object.keys(BING_ADS_ACCOUNTS).join(', ')}`,
        },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] Found account`, {
      accountId: accountInfo.id,
      accountName: accountInfo.name,
    })

    // Generate Bing Ads query using AI
    const queryResult = await generateBingAdsQuery(query)

    logger.info(`[${requestId}] Generated Bing Ads parameters`, {
      reportType: queryResult.reportType,
      columns: queryResult.columns,
      timeRange: queryResult.timeRange,
      queryType: queryResult.query_type,
      tables: queryResult.tables_used,
      metrics: queryResult.metrics_used,
    })

    // Execute the Bing Ads query against Bing Ads API
    logger.info(`[${requestId}] Executing Bing Ads query against account ${accountInfo.id}`)
    
    // Convert the AI response to API request format
    const apiRequest = {
      accountId: accountInfo.id,
      reportType: queryResult.reportType,
      columns: queryResult.columns,
      datePreset: queryResult.datePreset,
      timeRange: queryResult.timeRange,
      aggregation: queryResult.aggregation
    }
    const apiResult = await makeBingAdsRequest(apiRequest)

    // Process results
    const processedResults = processResults(apiResult, requestId)

    const executionTime = Date.now() - startTime

    logger.info(`[${requestId}] Query executed successfully`, {
      rowCount: processedResults.row_count,
      totalRows: processedResults.total_rows,
      hasTotals: !!processedResults.totals,
    })

    logger.info(`[${requestId}] Returning response`, {
      rowsReturned: processedResults.row_count,
      executionTime,
    })

    // Handle date range - use timeRange if provided, otherwise calculate from datePreset
    let datePreset, calculatedTimeRange
    if (queryResult.timeRange && queryResult.timeRange.start && queryResult.timeRange.end) {
      // Custom date range was used
      datePreset = null
      calculatedTimeRange = queryResult.timeRange
    } else {
      // Date preset was used
      datePreset = queryResult.datePreset || 'Last30Days'
      calculatedTimeRange = {
        start: getDateFromPreset(datePreset, 'start'),
        end: getDateFromPreset(datePreset, 'end')
      }
    }

    // Build response
    const response = {
      success: true,
      query: query,
      account: {
        id: accountInfo.id,
        name: accountInfo.name,
      },
      reportType: queryResult.reportType,
      columns: queryResult.columns,
      datePreset: datePreset,
      timeRange: calculatedTimeRange,
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

    logger.error(`[${requestId}] Bing Ads V1 query failed`, {
      error: errorMessage,
      executionTime,
    })

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: 'Failed to process Bing Ads V1 query',
        suggestion: 'Please check your query and try again.',
      },
      { status: 500 }
    )
  }
}

