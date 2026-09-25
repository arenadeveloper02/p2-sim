import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { type ChannelAccount, getGoogleAdsAccounts } from '@/lib/channel-accounts'
import { isAbortError } from '@/providers/streaming-tool-loop-shared'
import { makeGoogleAdsRequest } from '../../google-ads/query/google-ads-api'
import { extractDateRange, generateGAQLQuery } from './query-generation'
import { processResults } from './result-processing'
import type { GoogleAdsV1Request } from './types'

const logger = createLogger('GoogleAdsV1API')

export interface ExecuteGoogleAdsV1QueryInput extends GoogleAdsV1Request {
  userId?: string
}

export interface AdsQueryExecutionResult {
  status: number
  body: Record<string, unknown>
}

function resolveAccountKey(
  accountInput: string | undefined,
  googleAdsAccounts: Record<string, ChannelAccount>
): string {
  if (!accountInput) {
    return ''
  }
  if (googleAdsAccounts[accountInput]) {
    return accountInput
  }

  const foundAccount = Object.entries(googleAdsAccounts).find(
    ([, account]) => account.id === accountInput
  )

  if (foundAccount) {
    logger.info(`Resolved numeric ID ${accountInput} to account key ${foundAccount[0]}`)
    return foundAccount[0]
  }

  return accountInput
}

/**
 * Runs a Google Ads V1 natural-language query: catalog lookup, GAQL generation, API call.
 */
export async function executeGoogleAdsV1Query(
  input: ExecuteGoogleAdsV1QueryInput,
  options: { requestId: string; signal?: AbortSignal }
): Promise<AdsQueryExecutionResult> {
  const { requestId, signal } = options
  const startTime = Date.now()

  try {
    signal?.throwIfAborted()
    logger.info(`[${requestId}] Google Ads V1 query request started`)

    const { query, accounts, workspaceId, userId } = input

    if (!query) {
      logger.error(`[${requestId}] No query provided in request`)
      return { status: 400, body: { error: 'No query provided' } }
    }

    const googleAdsAccounts = await getGoogleAdsAccounts(workspaceId, userId)
    signal?.throwIfAborted()

    const resolvedAccountKey = resolveAccountKey(accounts, googleAdsAccounts)
    const accountInfo = googleAdsAccounts[resolvedAccountKey]
    if (!accountInfo) {
      logger.error(`[${requestId}] Invalid account key or ID`, {
        accounts,
        resolvedAccountKey,
        availableAccounts: Object.keys(googleAdsAccounts),
      })
      return {
        status: 400,
        body: {
          error: `Invalid account key or ID: ${accounts}. Available accounts: ${Object.keys(googleAdsAccounts).join(', ')}`,
        },
      }
    }

    logger.info(`[${requestId}] Found account`, {
      accountId: accountInfo.id,
      accountName: accountInfo.name,
    })

    const queryResult = await generateGAQLQuery(query)
    signal?.throwIfAborted()

    logger.info(`[${requestId}] Generated GAQL query`, {
      gaqlQuery: queryResult.gaql_query,
      queryType: queryResult.query_type,
      tables: queryResult.tables_used,
      metrics: queryResult.metrics_used,
    })

    logger.info(`[${requestId}] Executing GAQL query against account ${accountInfo.id}`)
    const apiResult = await makeGoogleAdsRequest(accountInfo.id, queryResult.gaql_query)
    signal?.throwIfAborted()

    const processedResults = processResults(apiResult, requestId, logger)

    logger.info(`[${requestId}] Query executed successfully`, {
      rowCount: processedResults.row_count,
      totalRows: processedResults.total_rows,
      hasTotals: !!processedResults.totals,
    })

    const executionTime = Date.now() - startTime
    const dateRange = extractDateRange(queryResult.gaql_query)

    return {
      status: 200,
      body: {
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
        ...(queryResult.cost ? { cost: queryResult.cost } : {}),
        ...(queryResult.model ? { model: queryResult.model } : {}),
        ...(queryResult.tokens ? { tokens: queryResult.tokens } : {}),
      },
    }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error

    const executionTime = Date.now() - startTime
    const errorMessage = getErrorMessage(error, 'Unknown error occurred')

    logger.error(`[${requestId}] Google Ads V1 query failed`, {
      error: errorMessage,
      executionTime,
    })

    return {
      status: 500,
      body: {
        success: false,
        error: errorMessage,
        details: 'Failed to process Google Ads V1 query',
        suggestion: 'Please check your query and try again.',
      },
    }
  }
}
