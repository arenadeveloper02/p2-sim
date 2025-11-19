import { type NextRequest, NextResponse } from 'next/server'
import { getFacebookAccountId, getFacebookAccountName } from '@/lib/facebook-accounts'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { parseQueryWithAI } from './ai-query-generation'
import { makeFacebookAdsRequest } from './facebook-ads-api'
import type { FacebookAdsRequest, FacebookAdsResponse } from './types'

const logger = createLogger('FacebookAdsAPI')

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const timestamp = new Date().toISOString()

  logger.info('Facebook Ads API request received', { requestId })

  try {
    const body: FacebookAdsRequest = await request.json()
    const { query, account, date_preset = 'last_30d', time_range, fields, level = 'account' } = body

    if (!query || !account) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: query and account',
          requestId,
          timestamp,
        },
        { status: 400 }
      )
    }

    logger.info('Processing Facebook Ads query', {
      requestId,
      account,
      query,
      date_preset,
      level,
    })

    // Get account ID
    const accountId = getFacebookAccountId(account as any)
    const accountName = getFacebookAccountName(account as any)

    logger.info('Account details', { accountId, accountName })

    // Parse natural language query with AI
    const parsedQuery = await parseQueryWithAI(query, accountName)

    logger.info('AI parsed query', { parsedQuery })

    // Make Facebook Graph API request
    const result = await makeFacebookAdsRequest(
      accountId,
      parsedQuery.endpoint,
      parsedQuery.fields,
      parsedQuery.date_preset || date_preset,
      parsedQuery.time_range || time_range,
      parsedQuery.level || level,
      parsedQuery.filters,
      parsedQuery.breakdowns
    )

    const response: FacebookAdsResponse = {
      success: true,
      data: result,
      requestId,
      account_id: accountId,
      account_name: accountName,
      query: query,
      timestamp,
    }

    logger.info('Facebook Ads API request successful', {
      requestId,
      resultsCount: result.data?.length || 0,
    })

    return NextResponse.json(response)
  } catch (error) {
    logger.error('Facebook Ads API request failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        requestId,
        timestamp,
      },
      { status: 500 }
    )
  }
}
