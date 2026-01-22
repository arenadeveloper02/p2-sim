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

    logger.info(`[${requestId}] Generated Bing Ads query`, {
      bingQuery: queryResult.bing_query,
      queryType: queryResult.query_type,
      tables: queryResult.tables_used,
      metrics: queryResult.metrics_used,
    })

    // Execute the Bing Ads query against Bing Ads API
    logger.info(`[${requestId}] Executing Bing Ads query against account ${accountInfo.id}`)
    
    // Parse the generated query to extract report parameters
    const apiRequest = parseQueryToApiRequest(queryResult.bing_query, accountInfo.id)
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

    // Build response
    const response = {
      success: true,
      query: query,
      account: {
        id: accountInfo.id,
        name: accountInfo.name,
      },
      bing_query: queryResult.bing_query,
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

/**
 * Parses generated Bing Ads query into API request parameters
 * 
 * @param query - Generated Bing Ads query
 * @param accountId - Account ID
 * @returns API request parameters
 */
function parseQueryToApiRequest(query: string, accountId: string) {
  // Simple parsing - extract report type and columns
  // TODO: Implement more sophisticated parsing
  
  const reportTypeMatch = query.match(/FROM (\w+)/)
  const reportType = reportTypeMatch ? reportTypeMatch[1] : 'CampaignPerformance'
  
  const columnsMatch = query.match(/SELECT (.+?) FROM/)
  const columns = columnsMatch ? columnsMatch[1].split(',').map((c: string) => c.trim()) : ['CampaignId', 'CampaignName', 'Spend']
  
  const timeRangeMatch = query.match(/TimeRange = \{'([^']+)', '([^']+)'\}/)
  const timeRange = timeRangeMatch ? {
    start: timeRangeMatch[1],
    end: timeRangeMatch[2]
  } : undefined

  return {
    accountId,
    reportType,
    columns,
    timeRange
  }
}
