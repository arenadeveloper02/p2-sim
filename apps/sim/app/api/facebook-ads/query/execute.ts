import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { getFacebookAdsAccounts } from '@/lib/channel-accounts'
import { isAdminWorkspace } from '@/lib/workspaces/is-admin-workspace'
import { isAbortError } from '@/providers/streaming-tool-loop-shared'
import { parseQueryWithAI } from './ai-query-generation'
import {
  makeFacebookAdsOAuthRequest,
  makeFacebookAdsRequest,
  resolveFacebookAccessToken,
} from './facebook-ads-api'
import type { FacebookAdsRequest, FacebookAdsResponse } from './types'

const logger = createLogger('FacebookAdsAPI')

export interface AdsQueryExecutionResult {
  status: number
  body: Record<string, unknown>
}

function hasUserProvidedFacebookAdsCredentials(body: FacebookAdsRequest): boolean {
  return Boolean(body.accessToken?.trim() || body.accountId?.trim() || body.adAccountId?.trim())
}

function resolveUsesAdminCredentials(body: FacebookAdsRequest): boolean {
  if (body.workspaceId && isAdminWorkspace(body.workspaceId)) {
    return true
  }
  if (hasUserProvidedFacebookAdsCredentials(body)) {
    return false
  }
  return Boolean(body.account?.trim())
}

function formatAdAccountId(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('act_')) {
    return trimmed
  }
  return `act_${trimmed.replace(/-/g, '')}`
}

function normalizeFacebookAccountId(raw: string): string {
  return raw.trim().replace(/^act_/, '').replace(/-/g, '')
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

    const facebookAccounts = await getFacebookAdsAccounts(body.workspaceId)
    const normalizedAccountId = normalizeFacebookAccountId(accountKey)
    const accountData =
      facebookAccounts[accountKey] ??
      Object.values(facebookAccounts).find(
        (account) => normalizeFacebookAccountId(account.id) === normalizedAccountId
      )

    if (!accountData) {
      throw new Error(`Account '${accountKey}' not found in database`)
    }

    return {
      accountId: formatAdAccountId(accountData.id),
      accountName: accountData.name,
    }
  }

  const rawAccountId = (body.accountId ?? body.adAccountId)?.trim()
  if (!rawAccountId) {
    throw new Error('Facebook ad account ID is required')
  }

  return {
    accountId: formatAdAccountId(rawAccountId),
    accountName: rawAccountId,
  }
}

/**
 * Runs a Facebook Ads natural-language query against admin catalog or user OAuth credentials.
 */
export async function executeFacebookAdsQuery(
  input: FacebookAdsRequest,
  options: { requestId: string; signal?: AbortSignal }
): Promise<AdsQueryExecutionResult> {
  const { requestId, signal } = options
  const timestamp = new Date().toISOString()

  logger.info('Facebook Ads API request received', { requestId })

  try {
    signal?.throwIfAborted()
    const { query, date_preset = 'last_30d', time_range, level = 'account' } = input

    if (!query) {
      return {
        status: 400,
        body: {
          success: false,
          error: 'Missing required field: query',
          requestId,
          timestamp,
        },
      }
    }

    const useAdminCredentials = resolveUsesAdminCredentials(input)

    let resolvedAccessToken: string | undefined

    if (!useAdminCredentials) {
      const accessToken = input.accessToken?.trim()
      const adAccountId = (input.accountId ?? input.adAccountId)?.trim()

      if (!accessToken || !adAccountId) {
        const missingFields: string[] = []
        if (!accessToken) missingFields.push('Facebook Ads account (OAuth)')
        if (!adAccountId) missingFields.push('Ad Account ID')
        return {
          status: 400,
          body: {
            success: false,
            error: `Missing required Facebook Ads fields: ${missingFields.join(', ')}. Connect your Facebook Ads account, add your ad account ID, then run again.`,
            requestId,
            timestamp,
          },
        }
      }

      resolvedAccessToken = resolveFacebookAccessToken(accessToken)
    }

    const { accountId, accountName } = await resolveAccountForRequest(input, useAdminCredentials)
    signal?.throwIfAborted()

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
    signal?.throwIfAborted()

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
      : await makeFacebookAdsOAuthRequest(resolvedAccessToken as string, requestOptions)
    signal?.throwIfAborted()

    const response: FacebookAdsResponse = {
      success: true,
      data: result,
      requestId,
      account_id: accountId,
      account_name: accountName,
      query,
      timestamp,
      ...(parsedQuery.cost ? { cost: parsedQuery.cost } : {}),
      ...(parsedQuery.model ? { model: parsedQuery.model } : {}),
      ...(parsedQuery.tokens ? { tokens: parsedQuery.tokens } : {}),
    }

    logger.info('Facebook Ads API request successful', {
      requestId,
      resultsCount: (result as { data?: unknown[] })?.data?.length || 0,
    })

    return { status: 200, body: { ...response } }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error

    const errorMessage = getErrorMessage(error, 'Unknown error occurred')
    logger.error('Facebook Ads API request failed', {
      requestId,
      error: errorMessage,
    })

    return {
      status: 500,
      body: {
        success: false,
        error: errorMessage,
        requestId,
        timestamp,
      },
    }
  }
}
