import { createLogger } from '@sim/logger'
import { FB_GRAPH_URL } from './constants'

const logger = createLogger('FacebookAdsAPIClient')

export interface FacebookAdsRequestOptions {
  accountId: string
  endpoint: string
  fields: string[]
  date_preset: string
  time_range?: { since: string; until: string }
  level?: string
  filters?: unknown
  breakdowns?: string[]
}

/**
 * Resolves the Marketing API access token. Requires a user or system user token with ads_read.
 * Client ID + secret alone only produce an app token, which cannot read ad account insights.
 */
export function resolveFacebookAccessToken(accessToken?: string): string {
  const explicitToken = accessToken?.trim()
  if (explicitToken) {
    return explicitToken
  }

  throw new Error(
    'FB Access Token is required. Provide a user or system user token with ads_read or ads_management permission. Tokens generated from client ID + secret only (app token) cannot access ad account data.'
  )
}

function formatFacebookApiError(status: number, errorText: string): string {
  try {
    const parsed = JSON.parse(errorText) as {
      error?: { message?: string; code?: number }
    }
    const message = parsed.error?.message
    if (
      message &&
      (message.includes('ads_read') ||
        message.includes('ads_management') ||
        parsed.error?.code === 200)
    ) {
      return `${message} Use a user or system user access token with ads_read (or ads_management), not an app-only token from client credentials.`
    }
    if (message) {
      return `Facebook API request failed: ${status} - ${message}`
    }
  } catch {
    // fall through to raw error text
  }
  return `Facebook API request failed: ${status} - ${errorText}`
}

/**
 * Executes a Facebook Graph API request using a bearer access token (non-admin workspaces).
 */
export async function makeFacebookAdsOAuthRequest(
  accessToken: string,
  options: FacebookAdsRequestOptions
): Promise<unknown> {
  return executeFacebookAdsGraphRequest(accessToken, options)
}

/**
 * Executes a Facebook Graph API request using server env credentials (admin workspaces).
 */
export async function makeFacebookAdsRequest(
  accountId: string,
  endpoint: string,
  fields: string[],
  date_preset: string,
  time_range?: { since: string; until: string },
  level?: string,
  filters?: unknown,
  breakdowns?: string[]
): Promise<unknown> {
  const accessToken = process.env.FB_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error(
      'Missing Facebook access token. Please set FB_ACCESS_TOKEN environment variable.'
    )
  }

  return executeFacebookAdsGraphRequest(accessToken, {
    accountId,
    endpoint,
    fields,
    date_preset,
    time_range,
    level,
    filters,
    breakdowns,
  })
}

async function executeFacebookAdsGraphRequest(
  accessToken: string,
  options: FacebookAdsRequestOptions
): Promise<unknown> {
  const { accountId, endpoint, fields, date_preset, time_range, level, filters, breakdowns } =
    options

  logger.info('Making Facebook Graph API request', {
    accountId,
    endpoint,
    fields,
    date_preset,
    level,
    breakdowns,
  })

  const apiUrl = `${FB_GRAPH_URL}/${accountId}/${endpoint}`

  const params = new URLSearchParams({
    access_token: accessToken,
    fields: fields.join(','),
  })

  if (endpoint === 'insights') {
    if (time_range) {
      params.append('time_range', JSON.stringify(time_range))
    } else {
      params.append('date_preset', date_preset)
    }

    if (level) {
      params.append('level', level)
    }

    params.append('time_increment', 'all_days')
    params.append('use_unified_attribution_setting', 'true')
    params.append('use_account_attribution_setting', 'false')
  }

  if (filters) {
    params.append('filtering', JSON.stringify(filters))
  }

  if (breakdowns && breakdowns.length > 0) {
    params.append('breakdowns', breakdowns.join(','))
  }

  const fullUrl = `${apiUrl}?${params.toString()}`

  logger.info('Facebook API request', { url: apiUrl, paramsCount: params.toString().length })

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('Facebook API request failed', {
      status: response.status,
      error: errorText,
    })
    throw new Error(formatFacebookApiError(response.status, errorText))
  }

  const data = await response.json()

  logger.info('Facebook API request successful', {
    resultsCount: (data as { data?: unknown[] }).data?.length || 0,
    hasData: !!(data as { data?: unknown }).data,
    hasPaging: !!(data as { paging?: unknown }).paging,
  })

  return data
}
