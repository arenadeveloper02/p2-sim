import { createLogger } from '@/lib/logs/console/logger'
import type { GBPPostRequest, GBPPostResponse } from './types'

const logger = createLogger('GBP-API')

/**
 * Create a Google Business Profile post
 */
export async function createGBPPost(
  accessToken: string,
  request: GBPPostRequest
): Promise<GBPPostResponse> {
  const { accountId, locationId, ...postData } = request

  logger.info('Creating GBP post', {
    accountId,
    locationId,
    topicType: postData.topicType,
  })

  try {
    // Build the GBP API URL for creating local posts (still uses v4 endpoint)
    // Format: accounts/{accountId}/locations/{locationId}/localPosts
    const apiUrl = `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/localPosts`

    // Build the post payload according to GBP API spec
    const payload: any = {
      languageCode: postData.languageCode || 'en',
      summary: postData.summary,
      topicType: postData.topicType,
    }

    // Add call to action if provided
    if (postData.callToAction) {
      payload.callToAction = {
        actionType: postData.callToAction.actionType,
        url: postData.callToAction.url,
      }
    }

    // Add media if provided
    if (postData.media && postData.media.length > 0) {
      payload.media = postData.media.map((m) => ({
        mediaFormat: m.mediaFormat,
        sourceUrl: m.sourceUrl,
      }))
    }

    // Add event details if EVENT post
    if (postData.topicType === 'EVENT' && postData.event) {
      payload.event = {
        title: postData.event.title,
        schedule: postData.event.schedule,
      }
    }

    // Add offer details if OFFER post
    if (postData.topicType === 'OFFER' && postData.offer) {
      payload.offer = {
        couponCode: postData.offer.couponCode,
        redeemOnlineUrl: postData.offer.redeemOnlineUrl,
        termsConditions: postData.offer.termsConditions,
      }
    }

    // Add search URL if provided
    if (postData.searchUrl) {
      payload.searchUrl = postData.searchUrl
    }

    logger.info('GBP API request', {
      url: apiUrl,
      payload: JSON.stringify(payload, null, 2),
    })

    // Make the API request
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('GBP API request failed', {
        status: response.status,
        error: errorText,
        accountId,
        locationId,
      })

      return {
        success: false,
        error: `GBP API error: ${response.status} - ${errorText}`,
        details: { status: response.status, body: errorText },
      }
    }

    const data = await response.json()
    logger.info('GBP post created successfully', {
      postName: data.name,
      accountId,
      locationId,
    })

    return {
      success: true,
      postId: data.name, // GBP returns the post resource name
      name: data.name,
      details: data,
    }
  } catch (error) {
    logger.error('Error creating GBP post', {
      error: error instanceof Error ? error.message : 'Unknown error',
      accountId,
      locationId,
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * List GBP accounts for the authenticated user
 */
export async function listGBPAccounts(accessToken: string): Promise<any[]> {
  logger.info('Listing GBP accounts')

  try {
    const apiUrl = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts'

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Failed to list GBP accounts', {
        status: response.status,
        error: errorText,
      })
      throw new Error(`Failed to list accounts: ${response.status}`)
    }

    const data = await response.json()
    return data.accounts || []
  } catch (error) {
    logger.error('Error listing GBP accounts', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }
}

/**
 * List locations for a GBP account
 */
export async function listGBPLocations(
  accessToken: string,
  accountId: string
): Promise<any> {
  logger.info('Listing GBP locations', { accountId })

  try {
    const apiUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations`

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Failed to list GBP locations', {
        status: response.status,
        error: errorText,
      })
      throw new Error(`Failed to list locations: ${response.status}`)
    }

    const data = await response.json()
    return data.locations || []
  } catch (error) {
    logger.error('Error listing GBP locations', {
      error: error instanceof Error ? error.message : 'Unknown error',
      accountId,
    })
    throw error
  }
}
