import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { getFacebookAdsAccounts } from '@/lib/channel-accounts'
import { generateRequestId } from '@/lib/core/utils/request'
import { isAdminWorkspace } from '@/lib/workspaces/is-admin-workspace'
import { parseQueryWithAI } from './ai-query-generation'
import {
  makeFacebookAdsOAuthRequest,
  makeFacebookAdsRequest,
} from './facebook-ads-api'
import type { FacebookAdsRequest, FacebookAdsResponse } from './types'

const logger = createLogger('FacebookAdsAPI')

function resolveUsesAdminCredentials(body: FacebookAdsRequest): boolean {
  if (body.workspaceId) {
    return isAdminWorkspace(body.workspaceId)
  }
  return Boolean(body.account && !body.accessToken)
}

function formatAdAccountId(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('act_')) {
    return trimmed
  }
  return `act_${trimmed.replace(/-/g, '')}`
}

async function resolveAccountForRequest(
  body: FacebookAdsRequest,
  useAdminCredentials: boolean
): Promise<{ accountId: string; accountName: string }> {
  if (useAdminCredentials) {
    const accountKey = body.account?.trim()
    if (!accountKey) {
      throw new Error('Facebook ad account is required for admin workspace queries')
    }

    const facebookAccounts = await getFacebookAdsAccounts()
    const accountData = facebookAccounts[accountKey]

    if (!accountData) {
      throw new Error(`Account '${accountKey}' not found in database`)
    }

    return {
      accountId: `act_${accountData.id}`,
      accountName: accountData.name,
    }
  }

  const adAccountId = body.adAccountId?.trim()
  if (!adAccountId) {
    throw new Error('Facebook ad account ID is required')
  }

  return {
    accountId: formatAdAccountId(adAccountId),
    accountName: adAccountId,
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const timestamp = new Date().toISOString()

  logger.info('Facebook Ads API request received', { requestId })

  try {
    const body: FacebookAdsRequest = await request.json()
    const workspaceId =
      body.workspaceId ?? request.nextUrl.searchParams.get('workspaceId') ?? undefined
    const { query, date_preset = 'last_30d', time_range, fields, level = 'account' } = body

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: query',
          requestId,
          timestamp,
        },
        { status: 400 }
      )
    }

    const useAdminCredentials = resolveUsesAdminCredentials({ ...body, workspaceId })

    if (!useAdminCredentials) {
      const accessToken = body.accessToken?.trim()
      if (!accessToken) {
        return NextResponse.json(
          {
            success: false,
            error: 'Facebook OAuth connection and access token are required for this workspace',
            requestId,
            timestamp,
          },
          { status: 400 }
        )
      }
    }

    const { accountId, accountName } = await resolveAccountForRequest(
      { ...body, workspaceId },
      useAdminCredentials
    )

    logger.info('Processing Facebook Ads query', {
      requestId,
      accountId,
      accountName,
      query,
      date_preset,
      level,
      useAdminCredentials,
    })

    const parsedQuery = await parseQueryWithAI(query, accountName)

    logger.info('AI parsed query', { parsedQuery })

    const requestOptions = {
      accountId,
      endpoint: parsedQuery.endpoint,
      fields: parsedQuery.fields,
      date_preset: parsedQuery.date_preset || date_preset,
      time_range: parsedQuery.time_range || time_range,
      level: parsedQuery.level || level,
      filters: parsedQuery.filters,
      breakdowns: parsedQuery.breakdowns,
    }

    const result = useAdminCredentials
      ? await makeFacebookAdsRequest(
          accountId,
          requestOptions.endpoint,
          requestOptions.fields,
          requestOptions.date_preset,
          requestOptions.time_range,
          requestOptions.level,
          requestOptions.filters,
          requestOptions.breakdowns
        )
      : await makeFacebookAdsOAuthRequest(body.accessToken as string, requestOptions)

    const response: FacebookAdsResponse = {
      success: true,
      data: result,
      requestId,
      account_id: accountId,
      account_name: accountName,
      query,
      timestamp,
    }

    logger.info('Facebook Ads API request successful', {
      requestId,
      resultsCount: (result as { data?: unknown[] })?.data?.length || 0,
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
