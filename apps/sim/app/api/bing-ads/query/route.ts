import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'
import { createLogger } from '@/lib/logs/console/logger'
import { parseQueryWithAI } from './ai-query-generation'
import { makeBingAdsRequest } from './bing-ads-api'
import { BING_ADS_ACCOUNTS, getBingAccountId, getBingAccountName } from './constants'
import type { BingAdsRequest, BingAdsResponse } from './types'

const logger = createLogger('BingAdsAPI')

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const timestamp = new Date().toISOString()

  logger.info('Bing Ads API request received', { requestId })

  try {
    const body: BingAdsRequest = await request.json()
    const { query, account } = body

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

    logger.info('Processing Bing Ads query', {
      requestId,
      account,
      query,
    })

    // Get account ID and name
    let accountId: string
    let accountName: string

    try {
      accountId = getBingAccountId(account)
      accountName = getBingAccountName(account)
    } catch (error) {
      // If account key not found, check if it's a direct account ID
      const accountInfo = Object.values(BING_ADS_ACCOUNTS).find(
        (acc) => acc.id === account || acc.name === account
      )
      if (accountInfo) {
        accountId = accountInfo.id
        accountName = accountInfo.name
      } else {
        logger.error('Invalid account', { account, requestId })
        return NextResponse.json(
          {
            success: false,
            error: `Invalid account: ${account}. Please select a valid Bing Ads account.`,
            requestId,
            timestamp,
          },
          { status: 400 }
        )
      }
    }

    logger.info('Account details', { accountId, accountName, requestId })

    // Parse natural language query with AI
    const parsedQuery = await parseQueryWithAI(query, accountName)

    logger.info('AI parsed query', { parsedQuery, requestId })

    // Make Bing Ads API request
    const result = await makeBingAdsRequest(accountId, parsedQuery)

    const response: BingAdsResponse = {
      success: true,
      data: result,
      requestId,
      account_id: accountId,
      account_name: accountName,
      query: query,
      timestamp,
      date_range: parsedQuery.timeRange || {
        start: getDateFromPreset(parsedQuery.datePreset || 'LastThirtyDays', 'start'),
        end: getDateFromPreset(parsedQuery.datePreset || 'LastThirtyDays', 'end'),
      },
    }

    logger.info('Bing Ads API request successful', {
      requestId,
      resultsCount: result.campaigns?.length || 0,
    })

    return NextResponse.json(response)
  } catch (error) {
    logger.error('Bing Ads API request failed', {
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

/**
 * Convert date preset to actual date string
 */
function getDateFromPreset(preset: string, type: 'start' | 'end'): string {
  const today = new Date()
  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  switch (preset) {
    case 'Today':
      return formatDate(today)

    case 'Yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return formatDate(yesterday)
    }

    case 'LastSevenDays': {
      if (type === 'end') return formatDate(today)
      const start = new Date(today)
      start.setDate(start.getDate() - 7)
      return formatDate(start)
    }

    case 'LastFourteenDays': {
      if (type === 'end') return formatDate(today)
      const start = new Date(today)
      start.setDate(start.getDate() - 14)
      return formatDate(start)
    }

    case 'LastThirtyDays': {
      if (type === 'end') return formatDate(today)
      const start = new Date(today)
      start.setDate(start.getDate() - 30)
      return formatDate(start)
    }

    case 'ThisWeek': {
      const dayOfWeek = today.getDay()
      const start = new Date(today)
      start.setDate(today.getDate() - dayOfWeek)
      if (type === 'start') return formatDate(start)
      return formatDate(today)
    }

    case 'LastWeek': {
      const dayOfWeek = today.getDay()
      const lastWeekEnd = new Date(today)
      lastWeekEnd.setDate(today.getDate() - dayOfWeek - 1)
      const lastWeekStart = new Date(lastWeekEnd)
      lastWeekStart.setDate(lastWeekEnd.getDate() - 6)
      if (type === 'start') return formatDate(lastWeekStart)
      return formatDate(lastWeekEnd)
    }

    case 'ThisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      if (type === 'start') return formatDate(start)
      return formatDate(today)
    }

    case 'LastMonth': {
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      if (type === 'start') return formatDate(lastMonthStart)
      return formatDate(lastMonthEnd)
    }

    default: {
      // Default to last 30 days
      if (type === 'end') return formatDate(today)
      const start = new Date(today)
      start.setDate(start.getDate() - 30)
      return formatDate(start)
    }
  }
}
