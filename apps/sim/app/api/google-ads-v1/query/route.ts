/**
 * Google Ads V1 API Route
 * Simplified, AI-powered Google Ads query endpoint
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'
import { GOOGLE_ADS_ACCOUNTS } from '../../google-ads/query/constants'
import { makeGoogleAdsRequest } from '../../google-ads/query/google-ads-api'
import { generateGAQLQuery } from './query-generation'
import { processResults } from './result-processing'
import type { GoogleAdsV1Request } from './types'

const logger = createLogger('GoogleAdsV1API')

/**
 * POST /api/google-ads-v1/query
 *
 * Handles Google Ads V1 query requests
 *
 * Request body:
 * - query: Natural language query (e.g., "show campaign performance last 7 days")
 * - accounts: Account key from GOOGLE_ADS_ACCOUNTS
 *
 * Response:
 * - success: boolean
 * - query: Original user query
 * - account: Account information
 * - gaql_query: Generated GAQL query
 * - results: Processed result rows
 * - totals: Aggregated metrics (if applicable)
 * - execution_time_ms: Total execution time
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    logger.info(`[${requestId}] Google Ads V1 query request started`)

    // Parse request body
    const body: GoogleAdsV1Request = await request.json()
    logger.info(`[${requestId}] Request body received`, { body })

    const { query, accounts } = body

    // Validate query
    if (!query) {
      logger.error(`[${requestId}] No query provided in request`)
      return NextResponse.json({ error: 'No query provided' }, { status: 400 })
    }

    // Get account information
    const accountInfo = GOOGLE_ADS_ACCOUNTS[accounts]
    if (!accountInfo) {
      logger.error(`[${requestId}] Invalid account key`, {
        accounts,
        availableAccounts: Object.keys(GOOGLE_ADS_ACCOUNTS),
      })
      return NextResponse.json(
        {
          error: `Invalid account key: ${accounts}. Available accounts: ${Object.keys(GOOGLE_ADS_ACCOUNTS).join(', ')}`,
        },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] Found account`, {
      accountId: accountInfo.id,
      accountName: accountInfo.name,
    })

    // Generate GAQL query using AI
    const queryResult = await generateGAQLQuery(query)

    logger.info(`[${requestId}] Generated GAQL query`, {
      gaqlQuery: queryResult.gaql_query,
      queryType: queryResult.query_type,
      tables: queryResult.tables_used,
      metrics: queryResult.metrics_used,
    })

    // Execute the GAQL query against Google Ads API
    logger.info(`[${requestId}] Executing GAQL query against account ${accountInfo.id}`)
    const apiResult = await makeGoogleAdsRequest(accountInfo.id, queryResult.gaql_query)

    // Process results
    const processedResults = processResults(apiResult, requestId, logger)

    logger.info(`[${requestId}] Query executed successfully`, {
      rowCount: processedResults.row_count,
      totalRows: processedResults.total_rows,
      hasTotals: !!processedResults.totals,
    })

    const executionTime = Date.now() - startTime

    // Build response
    const response = {
      success: true,
      query: query,
      account: {
        id: accountInfo.id,
        name: accountInfo.name,
      },
      gaql_query: queryResult.gaql_query,
      query_type: queryResult.query_type,
      tables_used: queryResult.tables_used,
      metrics_used: queryResult.metrics_used,
      results: processedResults.rows,
      row_count: processedResults.row_count,
      total_rows: processedResults.total_rows,
      totals: processedResults.totals,
      execution_time_ms: executionTime,
    }

    logger.info(`[${requestId}] Returning response`, {
      rowsReturned: processedResults.row_count,
      executionTime,
    })

    return NextResponse.json(response)
  } catch (error) {
    const executionTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    logger.error(`[${requestId}] Google Ads V1 query failed`, {
      error: errorMessage,
      executionTime,
    })

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: 'Failed to process Google Ads V1 query',
        suggestion: 'Please check your query and try again.',
      },
      { status: 500 }
    )
  }
}
