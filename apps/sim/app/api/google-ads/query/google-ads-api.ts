import { createLogger } from '@sim/logger'
import { POSITION2_MANAGER } from './constants'

const logger = createLogger('GoogleAdsAPI')

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

// Set to true to force 429 error on first attempt for testing
const TEST_FORCE_429 = process.env.TEST_FORCE_429 === 'true'

/**
 * Parses retryDelay from Google Ads API error response
 * Google returns retryDelay in seconds as a string
 */
function parseRetryDelay(errorText: string): number | null {
  try {
    const errorData = JSON.parse(errorText)
    if (errorData.error?.details?.[0]?.retryDelay) {
      const delaySeconds = parseInt(errorData.error.details[0].retryDelay, 10)
      if (!isNaN(delaySeconds)) {
        return delaySeconds * 1000 // Convert to milliseconds
      }
    }
  } catch {
    // If error parsing fails, return null
  }
  return null
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Makes a request to the Google Ads API using GAQL query with smart backoff retry
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

    // Make Google Ads API request with retry logic
    const adsApiUrl = `https://googleads.googleapis.com/v22/customers/${formattedCustomerId}/googleAds:search`

    const requestPayload = {
      query: gaqlQuery.trim(),
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      logger.info('Making Google Ads API request', {
        url: adsApiUrl,
        customerId: formattedCustomerId,
        query: gaqlQuery.trim(),
        managerCustomerId: POSITION2_MANAGER,
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES + 1,
      })

      // Test mode: force 429 on first attempt
      let adsResponse: Response
      if (TEST_FORCE_429 && attempt === 0) {
        logger.warn('[TEST MODE] Forcing 429 error on first attempt', { attempt: attempt + 1 })
        const mockError = JSON.stringify({
          error: {
            code: 429,
            message: 'RESOURCE_EXHAUSTED',
            details: [{ retryDelay: '5' }],
          },
        })
        // Simulate a 429 response
        adsResponse = {
          ok: false,
          status: 429,
          text: async () => mockError,
          json: async () => JSON.parse(mockError),
        } as Response
      } else {
        adsResponse = await fetch(adsApiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'login-customer-id': POSITION2_MANAGER,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
        })
      }

      if (adsResponse.ok) {
        const adsData = await adsResponse.json()
        logger.info('Google Ads API request successful', {
          resultsCount: adsData.results?.length || 0,
          customerId: formattedCustomerId,
          responseKeys: Object.keys(adsData),
          hasResults: !!adsData.results,
          firstResultKeys: adsData.results?.[0] ? Object.keys(adsData.results[0]) : [],
          attempt: attempt + 1,
        })

        // Log a sample of the response structure for debugging
        if (adsData.results?.[0]) {
          logger.debug('Sample Google Ads API response structure', {
            sampleResult: {
              keys: Object.keys(adsData.results[0]),
              campaign: adsData.results[0].campaign
                ? Object.keys(adsData.results[0].campaign)
                : null,
              metrics: adsData.results[0].metrics
                ? Object.keys(adsData.results[0].metrics)
                : null,
              segments: adsData.results[0].segments
                ? Object.keys(adsData.results[0].segments)
                : null,
            },
          })
        }

        return adsData
      }

      // Handle error with retry logic
      const errorText = await adsResponse.text()
      const status = adsResponse.status

      logger.error('Google Ads API request failed', {
        status,
        error: errorText,
        customerId: formattedCustomerId,
        managerCustomerId: POSITION2_MANAGER,
        attempt: attempt + 1,
      })

      // Only retry on 429 RESOURCE_EXHAUSTED errors
      if (status === 429 && attempt < MAX_RETRIES) {
        const retryDelay = parseRetryDelay(errorText)
        const delayMs = retryDelay || BASE_DELAY_MS * 2 ** attempt

        logger.warn('Retrying Google Ads API request after 429 error', {
          retryDelay: retryDelay
            ? `${retryDelay / 1000}s (from Google)`
            : `${delayMs / 1000}s (exponential backoff)`,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES + 1,
        })

        await sleep(delayMs)
        lastError = new Error(`Google Ads API request failed: ${status} - ${errorText}`)
        continue
      }

      // For 429 after max retries, inform user if Google specifies a long delay
      if (status === 429 && attempt === MAX_RETRIES) {
        const retryDelay = parseRetryDelay(errorText)
        if (retryDelay && retryDelay > 10000) {
          throw new Error(
            `Google Ads API rate limited. Please wait ${retryDelay / 1000} seconds before trying again.`
          )
        }
      }

      throw new Error(`Google Ads API request failed: ${status} - ${errorText}`)
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Google Ads API request failed')
  } catch (error) {
    logger.error('Error in Google Ads API request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      accountId,
    })
    throw error
  }
}
