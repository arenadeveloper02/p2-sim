import { createLogger } from '@sim/logger'
import { POSITION2_MANAGER } from './constants'

const logger = createLogger('GoogleAdsAPI')

/**
 * Makes a request to the Google Ads API using GAQL query
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

    // Make Google Ads API request with pagination
    const adsApiUrl = `https://googleads.googleapis.com/v22/customers/${formattedCustomerId}/googleAds:search`

    let allResults: any[] = []
    let nextPageToken: string | null = null
    let pageCount = 0
    const maxPages = 100 // Safety limit to prevent infinite loops
    let lastResponse: any = null

    do {
      pageCount++
      
      const requestPayload: any = {
        query: gaqlQuery.trim(),
        // Note: Google Ads API has fixed page size of 10,000 rows
      }

      // Add page token if we have one
      if (nextPageToken) {
        requestPayload.pageToken = nextPageToken
      }

      logger.info('Making Google Ads API request', {
        url: adsApiUrl,
        customerId: formattedCustomerId,
        query: gaqlQuery.trim(),
        managerCustomerId: POSITION2_MANAGER,
        pageToken: nextPageToken,
        pageCount,
        maxPages,
      })

      const adsResponse = await fetch(adsApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': POSITION2_MANAGER,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      })

      if (!adsResponse.ok) {
        const errorText = await adsResponse.text()
        logger.error('Google Ads API request failed', {
          status: adsResponse.status,
          error: errorText,
          customerId: formattedCustomerId,
          managerCustomerId: POSITION2_MANAGER,
          pageCount,
        })
        throw new Error(`Google Ads API request failed: ${adsResponse.status} - ${errorText}`)
      }

      const adsData = await adsResponse.json()
      lastResponse = adsData // Store for metadata access
      
      // Add results to our collection
      if (adsData.results && Array.isArray(adsData.results)) {
        allResults.push(...adsData.results)
        logger.info('Retrieved page results', {
          pageCount,
          resultsInPage: adsData.results.length,
          totalResultsSoFar: allResults.length,
        })
      }

      // Check for next page token
      nextPageToken = adsData.nextPageToken || null
      
      // Log pagination info
      logger.info('Pagination info', {
        pageCount,
        hasNextPage: !!nextPageToken,
        totalResultsSoFar: allResults.length,
        nextPageToken: nextPageToken ? `${nextPageToken.substring(0, 20)}...` : null,
      })

      // Safety check to prevent infinite loops
      if (pageCount >= maxPages) {
        logger.warn('Reached maximum page limit, stopping pagination', {
          pageCount,
          maxPages,
          totalResults: allResults.length,
        })
        break
      }

    } while (nextPageToken)

    // Construct final response with all results
    const finalResponse = {
      ...lastResponse, // Keep original metadata from last response
      results: allResults,
      totalResults: allResults.length,
      pagesRetrieved: pageCount,
      paginationComplete: !nextPageToken,
    }

    logger.info('Google Ads API request with pagination completed successfully', {
      customerId: formattedCustomerId,
      totalResults: allResults.length,
      pagesRetrieved: pageCount,
      paginationComplete: !nextPageToken,
      responseKeys: Object.keys(finalResponse),
      hasResults: !!finalResponse.results,
      firstResultKeys: finalResponse.results?.[0] ? Object.keys(finalResponse.results[0]) : [],
    })

    // Log a sample of the response structure for debugging
    if (finalResponse.results?.[0]) {
      logger.debug('Sample Google Ads API response structure', {
        sampleResult: {
          keys: Object.keys(finalResponse.results[0]),
          campaign: finalResponse.results[0].campaign ? Object.keys(finalResponse.results[0].campaign) : null,
          metrics: finalResponse.results[0].metrics ? Object.keys(finalResponse.results[0].metrics) : null,
          segments: finalResponse.results[0].segments ? Object.keys(finalResponse.results[0].segments) : null,
        },
      })
    }

    return finalResponse
  } catch (error) {
    logger.error('Error in Google Ads API request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      accountId,
    })
    throw error
  }
}
