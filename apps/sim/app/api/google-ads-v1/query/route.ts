/**
 * Google Ads V1 API Route
 * Simplified, AI-powered Google Ads query endpoint
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { buildGoogleAdsVisualizations } from '@/lib/chat/ads-visualizations'
import type { ChannelAccount } from '@/lib/channel-accounts'
import { getGoogleAdsAccounts } from '@/lib/channel-accounts'
import { generateRequestId } from '@/lib/core/utils/request'
import { makeGoogleAdsRequest } from '../../google-ads/query/google-ads-api'
import { extractDateRange, generateGAQLQuery } from './query-generation'
import { processResults } from './result-processing'
import type { GoogleAdsV1Request } from './types'

const logger = createLogger('GoogleAdsV1API')

/**
 * Resolves account input to account key (supports both keys and numeric IDs)
 * Updated: Added numeric ID support for better account resolution
 */
function resolveAccountKey(
  accountInput: string,
  googleAdsAccounts: Record<string, ChannelAccount>
): string {
  // Try direct key match first (gentle_dental)
  if (googleAdsAccounts[accountInput]) {
    return accountInput
  }

  // If not found, search by numeric ID
  const foundAccount = Object.entries(googleAdsAccounts).find(
    ([key, account]) => account.id === accountInput
  )

  if (foundAccount) {
    logger.info(`Resolved numeric ID ${accountInput} to account key ${foundAccount[0]}`)
    return foundAccount[0]
  }

  // Return original if not found (will show error in validation)
  return accountInput
}

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

    const { query, accounts, workspaceId: bodyWorkspaceId } = body
    const workspaceId =
      bodyWorkspaceId ?? request.nextUrl.searchParams.get('workspaceId') ?? undefined
    const userId = request.nextUrl.searchParams.get('userId') ?? undefined

    // Validate query
    if (!query) {
      logger.error(`[${requestId}] No query provided in request`)
      return NextResponse.json({ error: 'No query provided' }, { status: 400 })
    }

    const googleAdsAccounts = await getGoogleAdsAccounts(workspaceId, userId)

    // Resolve account input (supports both keys and numeric IDs)
    const resolvedAccountKey = resolveAccountKey(accounts ?? '', googleAdsAccounts)

    // Get account information
    const accountInfo = googleAdsAccounts[resolvedAccountKey]
    if (!accountInfo) {
      logger.error(`[${requestId}] Invalid account key or ID`, {
        accounts,
        resolvedAccountKey,
        availableAccounts: Object.keys(googleAdsAccounts),
      })
      return NextResponse.json(
        {
          error: `Invalid account key or ID: ${accounts}. Available accounts: ${Object.keys(googleAdsAccounts).join(', ')}`,
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

    // Extract date range from GAQL query
    const dateRange = extractDateRange(queryResult.gaql_query)

    // Build interactive chart specs from the result rows (deterministic; no LLM).
    // Rendered by the shared ChartRenderer in both the deployed and workflow chats.
    const visualizations = buildGoogleAdsVisualizations(processedResults.rows)

    // Build response with pagination info
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
      date_range: dateRange
        ? {
            start_date: dateRange.startDate,
            end_date: dateRange.endDate,
          }
        : null,
      results: processedResults.rows,
      row_count: processedResults.row_count,
      total_rows: processedResults.total_rows,
      totals: processedResults.totals,
      visualizations,
      execution_time_ms: executionTime,
    }

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
