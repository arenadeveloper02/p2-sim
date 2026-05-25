/**
 * Google Ads V1 API Route
 * Simplified, AI-powered Google Ads query endpoint
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'
import { isAdminWorkspace } from '@/lib/workspaces/is-admin-workspace'
import { GOOGLE_ADS_ACCOUNTS } from '../../google-ads/query/constants'
import {
  makeGoogleAdsOAuthRequest,
  makeGoogleAdsRequest,
} from '../../google-ads/query/google-ads-api'
import { extractDateRange, generateGAQLQuery } from './query-generation'
import { processResults } from './result-processing'
import type { GoogleAdsV1Request } from './types'

const logger = createLogger('GoogleAdsV1API')

/**
 * Resolves account input to account key (supports both keys and numeric IDs)
 */
function resolveAccountKey(accountInput: string): string {
  if (GOOGLE_ADS_ACCOUNTS[accountInput]) {
    return accountInput
  }

  const foundAccount = Object.entries(GOOGLE_ADS_ACCOUNTS).find(
    ([, account]) => account.id === accountInput
  )

  if (foundAccount) {
    logger.info(`Resolved numeric ID ${accountInput} to account key ${foundAccount[0]}`)
    return foundAccount[0]
  }

  return accountInput
}

function resolveUsesAdminCredentials(body: GoogleAdsV1Request): boolean {
  if (body.workspaceId) {
    return isAdminWorkspace(body.workspaceId)
  }
  return Boolean(body.accounts && !body.accessToken)
}

/**
 * POST /api/google-ads-v1/query
 *
 * Admin workspaces: env credentials (GOOGLE_ADS_* ) + account from GOOGLE_ADS_ACCOUNTS.
 * Non-admin workspaces: user OAuth access token, developer token, and customer ID from the block.
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    logger.info(`[${requestId}] Google Ads V1 query request started`)

    const body: GoogleAdsV1Request = await request.json()
    const workspaceId =
      body.workspaceId ?? request.nextUrl.searchParams.get('workspaceId') ?? undefined
    const { query } = body

    if (!query) {
      logger.error(`[${requestId}] No query provided in request`)
      return NextResponse.json({ error: 'No query provided' }, { status: 400 })
    }

    const queryResult = await generateGAQLQuery(query)

    logger.info(`[${requestId}] Generated GAQL query`, {
      gaqlQuery: queryResult.gaql_query,
      queryType: queryResult.query_type,
      tables: queryResult.tables_used,
      metrics: queryResult.metrics_used,
    })

    const useAdminCredentials = resolveUsesAdminCredentials({ ...body, workspaceId })

    let accountInfo: { id: string; name: string }
    let apiResult: unknown

    if (useAdminCredentials) {
      const accounts = body.accounts
      if (!accounts?.trim()) {
        return NextResponse.json(
          { error: 'Google Ads account is required for admin workspace queries' },
          { status: 400 }
        )
      }

      const resolvedAccountKey = resolveAccountKey(accounts)
      const resolved = GOOGLE_ADS_ACCOUNTS[resolvedAccountKey]
      if (!resolved) {
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

      accountInfo = resolved
      logger.info(`[${requestId}] Executing with env credentials for account ${accountInfo.id}`)
      apiResult = await makeGoogleAdsRequest(accountInfo.id, queryResult.gaql_query)
    } else {
      const customerId = body.customerId?.trim()
      const developerToken = body.developerToken?.trim()
      const accessToken = body.accessToken?.trim()

      if (!customerId || !developerToken || !accessToken) {
        return NextResponse.json(
          {
            error:
              'Google Ads account, developer token, and OAuth connection are required for this workspace',
          },
          { status: 400 }
        )
      }

      accountInfo = { id: customerId.replace(/-/g, ''), name: `Customer ${customerId}` }
      logger.info(
        `[${requestId}] Executing with user OAuth credentials for customer ${accountInfo.id}`
      )
      apiResult = await makeGoogleAdsOAuthRequest({
        customerId,
        gaqlQuery: queryResult.gaql_query,
        accessToken,
        developerToken,
        managerCustomerId: body.managerCustomerId,
      })
    }

    const processedResults = processResults(apiResult, requestId, logger)

    logger.info(`[${requestId}] Query executed successfully`, {
      rowCount: processedResults.row_count,
      totalRows: processedResults.total_rows,
      hasTotals: !!processedResults.totals,
      useAdminCredentials,
    })

    const executionTime = Date.now() - startTime
    const dateRange = extractDateRange(queryResult.gaql_query)

    return NextResponse.json({
      success: true,
      query,
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
      execution_time_ms: executionTime,
    })
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
