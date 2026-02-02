/**
 * Bing Ads V1 API Route
 * Handles Bing Ads queries with dynamic date calculation like Google Ads V1
 */

import { createLogger } from '@/lib/logs/console/logger'
import { NextRequest, NextResponse } from 'next/server'
import { BING_ADS_ACCOUNTS } from './constants'
import { generateBingAdsQuery } from './query-generation'
import { makeBingAdsRequest } from './bing-api'
import { processResults } from './result-processing'
import type { BingAdsV1Request } from './types'

const logger = createLogger('BingAdsV1Route')

export async function POST(request: NextRequest): Promise<NextResponse<any>> {
  const startTime = Date.now()
  const requestId = Math.random().toString(36).substring(7)

  try {
    logger.info(`[${requestId}] Bing Ads V1 query request received`)

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
      timeRange: queryResult.timeRange, // Always use timeRange from AI
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
