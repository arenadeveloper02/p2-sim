/**
 * Bing Ads API Route
 * Handles Bing Ads queries with dynamic date calculation
 */

import { type NextRequest, NextResponse } from 'next/server'
import type { ChannelAccount } from '@/lib/channel-accounts'
import { getBingAdsAccounts } from '@/lib/channel-accounts'
import { generateBingAdsQuery } from './query-generation'
import { makeBingAdsRequest } from './bing-ads-api'
import { processResults } from './result-processing'
import type { BingAdsV1Request } from './types'

/**
 * Resolves an account input to a catalog key, accepting either the key itself
 * (`amazon_web_services`) or the raw Bing account ID (`40043856`).
 */
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

export async function POST(request: NextRequest): Promise<NextResponse<any>> {
  const startTime = Date.now()

  try {
    const body: BingAdsV1Request = await request.json()
    const { query, account, workspaceId: bodyWorkspaceId } = body
    const workspaceId =
      bodyWorkspaceId ?? request.nextUrl.searchParams.get('workspaceId') ?? undefined

    // Validate query
    if (!query) {
      return NextResponse.json({ error: 'No query provided' }, { status: 400 })
    }

    // Validate account
    if (!account) {
      return NextResponse.json({ error: 'No account provided' }, { status: 400 })
    }

    // Resolve the account against the catalog visible to this workspace
    const bingAdsAccounts = await getBingAdsAccounts(workspaceId)
    const accountInfo = bingAdsAccounts[resolveAccountKey(account, bingAdsAccounts)]
    if (!accountInfo) {
      return NextResponse.json(
        {
          error: `Invalid account key or ID: ${account}. Available accounts: ${Object.keys(bingAdsAccounts).join(', ')}`,
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
      const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1

      // Map to closest preset (only use Bing Ads supported presets)
      if (rangeDays === 1) return 'Yesterday'
      if (rangeDays === 0) return 'Today'
      if (rangeDays <= 7) return 'LastSevenDays'
      if (rangeDays <= 14) return 'Last14Days'
      return 'Last30Days'
    }

    // Map dynamic dates to preset for Bing Ads API
    const datePreset = mapTimeRangeToPreset(queryResult.timeRange || { start: '', end: '' })

    // Execute the Bing Ads query against Bing Ads API
    const apiResult = await makeBingAdsRequest(accountInfo.id, {
      reportType: queryResult.reportType,
      columns: queryResult.columns,
      timeRange: undefined, // Use preset instead of custom dates
      datePreset: datePreset, // Use mapped preset
      aggregation: queryResult.aggregation,
      campaignFilter: undefined,
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
        details: 'Failed to process Bing Ads query',
        suggestion: 'Please check your query and try again.',
        execution_time_ms: executionTime,
      },
      { status: 500 }
    )
  }
}
