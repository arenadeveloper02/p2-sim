/**
 * Google Ads V1 API Route
 * Simplified, AI-powered Google Ads query endpoint
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { resolveSessionOrInternalUserId } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { toError } from '@sim/utils/errors'
import { GOOGLE_ADS_ACCOUNTS } from '../../google-ads/query/constants'
import { makeGoogleAdsRequest } from '../../google-ads/query/google-ads-api'
import {
  makeGoogleAdsOAuthRequest,
  resolveGoogleAdsDeveloperToken,
} from '../../google-ads/query/google-ads-oauth-api'
import { extractDateRange, generateGAQLQuery } from './query-generation'
import { processResults } from './result-processing'
import type { GoogleAdsV1Request } from './types'

const logger = createLogger('GoogleAdsV1API')

/**
 * Resolves account input to account key (supports both keys and numeric IDs)
 * Updated: Added numeric ID support for better account resolution
 */
function resolveAccountKey(accountInput: string): string {
  // Try direct key match first (gentle_dental)
  if (GOOGLE_ADS_ACCOUNTS[accountInput]) {
    return accountInput
  }

  // If not found, search by numeric ID
  const foundAccount = Object.entries(GOOGLE_ADS_ACCOUNTS).find(
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
export const POST = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    logger.info(`[${requestId}] Google Ads V1 query request started`)

    const body: GoogleAdsV1Request = await request.json()
    logger.info(`[${requestId}] Request body received`, { body })

    const {
      query,
      accounts,
      customerId: customerIdParam,
      managerCustomerId,
      developerToken,
      oauthCredential,
    } = body

    if (!query) {
      logger.error(`[${requestId}] No query provided in request`)
      return NextResponse.json({ error: 'No query provided' }, { status: 400 })
    }

    let customerId: string
    let accountName: string

    let executionUserId: string | undefined

    if (oauthCredential) {
      const auth = await resolveSessionOrInternalUserId(request)
      if (!auth.success || !auth.userId) {
        return NextResponse.json(
          { error: auth.error ?? 'User not authenticated' },
          { status: 401 }
        )
      }
      executionUserId = auth.userId

      const rawCustomerId = customerIdParam ?? accounts
      if (!rawCustomerId) {
        return NextResponse.json(
          { error: 'Google Ads customer ID is required when using OAuth credentials' },
          { status: 400 }
        )
      }

      customerId = String(rawCustomerId).replace(/-/g, '')
      accountName = customerId

      try {
        resolveGoogleAdsDeveloperToken(developerToken)
      } catch (tokenError) {
        const err = toError(tokenError)
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
    } else {
      if (!accounts) {
        return NextResponse.json({ error: 'Google Ads account is required' }, { status: 400 })
      }

      const resolvedAccountKey = resolveAccountKey(accounts)
      const accountInfo = GOOGLE_ADS_ACCOUNTS[resolvedAccountKey]
      if (!accountInfo) {
        logger.error(`[${requestId}] Invalid account key or ID`, {
          accounts,
          resolvedAccountKey,
          availableAccounts: Object.keys(GOOGLE_ADS_ACCOUNTS),
        })
        return NextResponse.json(
          {
            error: `Invalid account key or ID: ${accounts}. Available accounts: ${Object.keys(GOOGLE_ADS_ACCOUNTS).join(', ')}`,
          },
          { status: 400 }
        )
      }

      customerId = accountInfo.id
      accountName = accountInfo.name
    }

    logger.info(`[${requestId}] Found account`, {
      accountId: customerId,
      accountName,
      usesOAuth: Boolean(oauthCredential),
    })

    const queryResult = await generateGAQLQuery(query)

    logger.info(`[${requestId}] Generated GAQL query`, {
      gaqlQuery: queryResult.gaql_query,
      queryType: queryResult.query_type,
      tables: queryResult.tables_used,
      metrics: queryResult.metrics_used,
    })

    logger.info(`[${requestId}] Executing GAQL query against account ${customerId}`)
    const apiResult = oauthCredential
      ? await makeGoogleAdsOAuthRequest(
          oauthCredential,
          executionUserId!,
          customerId,
          queryResult.gaql_query,
          managerCustomerId,
          developerToken
        )
      : await makeGoogleAdsRequest(customerId, queryResult.gaql_query)

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

    // Build response with pagination info
    const response = {
      success: true,
      query: query,
      account: {
        id: customerId,
        name: accountName,
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
      execution_time_ms: executionTime,
    }

    return NextResponse.json(response)
  } catch (error) {
    const executionTime = Date.now() - startTime
    const err = toError(error)

    logger.error(`[${requestId}] Google Ads V1 query failed`, {
      error: err.message,
      executionTime,
    })

    return NextResponse.json(
      {
        success: false,
        error: err.message,
        details: 'Failed to process Google Ads V1 query',
        suggestion: 'Please check your query and try again.',
      },
      { status: 500 }
    )
  }
})
