import { createLogger } from '@sim/logger'
import { POSITION2_MANAGER } from './constants'

const logger = createLogger('GoogleAdsAPI')

const MAX_RETRIES = 3

/**
 * Extracts offending field names from a Google Ads PROHIBITED_* error message.
 * Handles three error types:
 *   - PROHIBITED_METRIC_IN_SELECT_OR_WHERE_CLAUSE
 *   - PROHIBITED_SEGMENT_IN_SELECT_OR_WHERE_CLAUSE
 *   - PROHIBITED_SEGMENT_WITH_METRIC_IN_SELECT_OR_WHERE_CLAUSE (returns the unsupported metrics)
 */
function extractProhibitedFields(errorText: string): { metrics: string[]; segments: string[] } {
  const metrics = new Set<string>()
  const segments = new Set<string>()

  const isProhibitedMetric = errorText.includes('PROHIBITED_METRIC_IN_SELECT_OR_WHERE_CLAUSE')
  const isProhibitedSegment = errorText.includes('PROHIBITED_SEGMENT_IN_SELECT_OR_WHERE_CLAUSE')
  const isProhibitedSegmentWithMetric = errorText.includes(
    'PROHIBITED_SEGMENT_WITH_METRIC_IN_SELECT_OR_WHERE_CLAUSE'
  )

  if (isProhibitedSegmentWithMetric) {
    const unsupportedMetricsRegex = /unsupported metrics:\s*((?:'[a-z_]+'(?:,\s*)?)+)/g
    let match: RegExpExecArray | null
    while ((match = unsupportedMetricsRegex.exec(errorText)) !== null) {
      const metricNames = match[1].match(/'([a-z_]+)'/g) || []
      for (const m of metricNames) metrics.add(m.replace(/'/g, ''))
    }
  } else if (isProhibitedMetric) {
    const metricsListRegex = /following metrics:\s*((?:'[a-z_]+'(?:\([^)]*\))?(?:,\s*)?)+)/g
    let match: RegExpExecArray | null
    while ((match = metricsListRegex.exec(errorText)) !== null) {
      const metricNames = match[1].match(/'([a-z_]+)'/g) || []
      for (const m of metricNames) metrics.add(m.replace(/'/g, ''))
    }
  } else if (isProhibitedSegment) {
    const segmentsListRegex = /following segments:\s*((?:'segments\.[a-z_]+'(?:\([^)]*\))?(?:,\s*)?)+)/g
    let match: RegExpExecArray | null
    while ((match = segmentsListRegex.exec(errorText)) !== null) {
      const segmentNames = match[1].match(/'(segments\.[a-z_]+)'/g) || []
      for (const s of segmentNames) segments.add(s.replace(/'/g, ''))
    }
  }

  return { metrics: Array.from(metrics), segments: Array.from(segments) }
}

/**
 * Removes the given metric/segment fields from a GAQL query's SELECT, WHERE, and ORDER BY clauses.
 */
function stripFieldsFromQuery(
  query: string,
  fields: { metrics: string[]; segments: string[] }
): string {
  let updated = query

  const allFieldNames = [
    ...fields.metrics.map((m) => `metrics\\.${m}`),
    ...fields.segments.map((s) => s.replace('.', '\\.')),
  ]

  for (const field of allFieldNames) {
    updated = updated.replace(new RegExp(`,\\s*${field}\\b`, 'gi'), '')
    updated = updated.replace(new RegExp(`${field}\\s*,\\s*`, 'gi'), '')
    updated = updated.replace(
      new RegExp(`\\s+(AND|OR)\\s+${field}\\s*(=|!=|>|<|>=|<=|IN|NOT IN)\\s*[^\\s]+(?:\\s*,\\s*[^\\s]+)*\\)?`, 'gi'),
      ''
    )
    updated = updated.replace(
      new RegExp(`${field}\\s*(=|!=|>|<|>=|<=|IN|NOT IN)\\s*[^\\s]+\\s+(AND|OR)\\s+`, 'gi'),
      ''
    )
    updated = updated.replace(new RegExp(`ORDER\\s+BY\\s+${field}\\s+(ASC|DESC)?`, 'gi'), '')
  }

  return updated.replace(/\s+/g, ' ').trim()
}

/**
 * Makes a request to the Google Ads API using GAQL query.
 * Auto-retries (up to MAX_RETRIES) when Google Ads rejects incompatible metrics/segments.
 */
export async function makeGoogleAdsRequest(accountId: string, gaqlQuery: string): Promise<any> {
  logger.info('Making real Google Ads API request', { accountId, gaqlQuery })

  try {
    // Get Google Ads API credentials from environment variables
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN

    if (!clientId || !clientSecret || !refreshToken || !developerToken) {
      throw new Error(
        'Missing Google Ads API credentials. Please set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_ADS_REFRESH_TOKEN environment variables.'
      )
    }

    logger.info('Using Google Ads credentials', {
      developerToken: `${developerToken.substring(0, 10)}...`,
      clientId: `${clientId.substring(0, 30)}...`,
      clientIdFull: clientId, // Log full client ID for debugging
      hasClientSecret: !!clientSecret,
      hasRefreshToken: !!refreshToken,
      clientSecretLength: clientSecret.length,
      refreshTokenLength: refreshToken.length,
    })

    // Prepare token request body
    const tokenRequestBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })

    logger.info('Token request details', {
      url: 'https://oauth2.googleapis.com/token',
      bodyParams: {
        client_id: clientId,
        grant_type: 'refresh_token',
        hasClientSecret: !!clientSecret,
        hasRefreshToken: !!refreshToken,
      },
    })

    // Get access token using refresh token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody,
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      logger.error('Token refresh failed', {
        status: tokenResponse.status,
        error: errorText,
        clientId: `${clientId.substring(0, 20)}...`,
      })
      throw new Error(
        `Failed to refresh Google Ads access token: ${tokenResponse.status} - ${errorText}`
      )
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    logger.info('Successfully obtained access token')

    // Format customer ID (remove dashes if present)
    const formattedCustomerId = accountId.replace(/-/g, '')

    // Make Google Ads API request
    const adsApiUrl = `https://googleads.googleapis.com/v22/customers/${formattedCustomerId}/googleAds:search`

    logger.info('Making Google Ads API request', {
      url: adsApiUrl,
      customerId: formattedCustomerId,
      query: gaqlQuery.trim(),
      managerCustomerId: POSITION2_MANAGER,
    })

    let currentQuery = gaqlQuery.trim()
    let adsResponse = await fetch(adsApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': POSITION2_MANAGER,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: currentQuery }),
    })

    let attempt = 0
    while (!adsResponse.ok && attempt < MAX_RETRIES) {
      const errorText = await adsResponse.text()
      const offending = extractProhibitedFields(errorText)

      if (offending.metrics.length === 0 && offending.segments.length === 0) {
        logger.error('Google Ads API request failed (non-retriable)', {
          status: adsResponse.status,
          error: errorText,
          customerId: formattedCustomerId,
        })
        throw new Error(`Google Ads API request failed: ${adsResponse.status} - ${errorText}`)
      }

      const strippedQuery = stripFieldsFromQuery(currentQuery, offending)
      logger.warn('Google Ads rejected fields - retrying with stripped query', {
        attempt: attempt + 1,
        removedMetrics: offending.metrics,
        removedSegments: offending.segments,
        before: currentQuery,
        after: strippedQuery,
      })

      if (strippedQuery === currentQuery) {
        throw new Error(`Google Ads API request failed: ${adsResponse.status} - ${errorText}`)
      }

      currentQuery = strippedQuery
      attempt += 1
      adsResponse = await fetch(adsApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': POSITION2_MANAGER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: currentQuery }),
      })
    }

    if (!adsResponse.ok) {
      const errorText = await adsResponse.text()
      logger.error('Google Ads API request failed after retries', {
        status: adsResponse.status,
        error: errorText,
        customerId: formattedCustomerId,
        retries: attempt,
      })
      throw new Error(`Google Ads API request failed: ${adsResponse.status} - ${errorText}`)
    }

    const adsData = await adsResponse.json()
    logger.info('Google Ads API request successful', {
      resultsCount: adsData.results?.length || 0,
      customerId: formattedCustomerId,
      responseKeys: Object.keys(adsData),
      hasResults: !!adsData.results,
      firstResultKeys: adsData.results?.[0] ? Object.keys(adsData.results[0]) : [],
    })

    // Log a sample of the response structure for debugging
    if (adsData.results?.[0]) {
      logger.debug('Sample Google Ads API response structure', {
        sampleResult: {
          keys: Object.keys(adsData.results[0]),
          campaign: adsData.results[0].campaign ? Object.keys(adsData.results[0].campaign) : null,
          metrics: adsData.results[0].metrics ? Object.keys(adsData.results[0].metrics) : null,
          segments: adsData.results[0].segments ? Object.keys(adsData.results[0].segments) : null,
        },
      })
    }

    return adsData
  } catch (error) {
    logger.error('Error in Google Ads API request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      accountId,
    })
    throw error
  }
}
