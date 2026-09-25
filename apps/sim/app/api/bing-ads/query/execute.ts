import { getErrorMessage } from '@sim/utils/errors'
import { type ChannelAccount, getBingAdsAccounts } from '@/lib/channel-accounts'
import { isAbortError } from '@/providers/streaming-tool-loop-shared'
import { makeBingAdsRequest } from './bing-ads-api'
import { generateBingAdsQuery } from './query-generation'
import { processResults } from './result-processing'
import type { BingAdsV1Request } from './types'

export interface AdsQueryExecutionResult {
  status: number
  body: Record<string, unknown>
}

function resolveAccountKey(
  accountInput: string,
  bingAdsAccounts: Record<string, ChannelAccount>
): string {
  if (bingAdsAccounts[accountInput]) {
    return accountInput
  }

  const foundAccount = Object.entries(bingAdsAccounts).find(
    ([, account]) => account.id === accountInput
  )

  return foundAccount ? foundAccount[0] : accountInput
}

/**
 * Runs a Bing Ads natural-language query: catalog lookup, report generation, API call.
 */
export async function executeBingAdsQuery(
  input: BingAdsV1Request,
  options: { signal?: AbortSignal }
): Promise<AdsQueryExecutionResult> {
  const { signal } = options
  const startTime = Date.now()

  try {
    signal?.throwIfAborted()
    const { query, account, workspaceId } = input

    if (!query) {
      return { status: 400, body: { error: 'No query provided' } }
    }

    if (!account) {
      return { status: 400, body: { error: 'No account provided' } }
    }

    const bingAdsAccounts = await getBingAdsAccounts(workspaceId)
    signal?.throwIfAborted()
    const accountInfo = bingAdsAccounts[resolveAccountKey(account, bingAdsAccounts)]
    if (!accountInfo) {
      return {
        status: 400,
        body: {
          error: `Invalid account key or ID: ${account}. Available accounts: ${Object.keys(bingAdsAccounts).join(', ')}`,
        },
      }
    }

    const queryResult = await generateBingAdsQuery(query)
    signal?.throwIfAborted()

    const apiResult = await makeBingAdsRequest(accountInfo.id, {
      reportType: queryResult.reportType,
      columns: queryResult.columns,
      timeRange: queryResult.timeRange,
      datePreset: undefined,
      aggregation: queryResult.aggregation,
      campaignFilter: queryResult.campaignFilter,
      adGroupFilter: queryResult.adGroupFilter,
      keywordFilter: queryResult.keywordFilter,
    })
    signal?.throwIfAborted()

    if (apiResult?.error) {
      throw new Error(apiResult.error)
    }

    const processedResults = processResults(apiResult, '')
    const executionTime = Date.now() - startTime

    return {
      status: 200,
      body: {
        success: true,
        query,
        account: {
          id: accountInfo.id,
          name: accountInfo.name,
        },
        reportType: queryResult.reportType,
        columns: queryResult.columns,
        datePreset: null,
        timeRange: queryResult.timeRange,
        query_type: queryResult.query_type,
        tables_used: queryResult.tables_used,
        metrics_used: queryResult.metrics_used,
        campaign_filter: queryResult.campaignFilter ?? null,
        ad_group_filter: queryResult.adGroupFilter ?? null,
        keyword_filter: queryResult.keywordFilter ?? null,
        data: processedResults.rows,
        row_count: processedResults.row_count,
        total_rows: processedResults.total_rows,
        totals: processedResults.totals,
        execution_time_ms: executionTime,
      },
    }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error

    const executionTime = Date.now() - startTime
    return {
      status: 500,
      body: {
        success: false,
        error: getErrorMessage(error, 'Unknown error occurred'),
        details: 'Failed to process Bing Ads query',
        suggestion: 'Please check your query and try again.',
        execution_time_ms: executionTime,
      },
    }
  }
}
