import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { generateRequestId } from '@/lib/core/utils/request'
import {
  getCredential,
  refreshTokenIfNeeded,
} from '@/app/api/auth/oauth/utils'
import { readJsonResponse } from '@/app/api/google-ads/query/read-json-response'

const logger = createLogger('GoogleAdsOAuthAPI')

const LIST_ACCESSIBLE_CUSTOMERS_URL =
  'https://googleads.googleapis.com/v19/customers:listAccessibleCustomers'

/**
 * Resolves the Google Ads API developer token from block input or server env.
 */
export function resolveGoogleAdsDeveloperToken(override?: string): string {
  const fromOverride = override?.trim()
  if (fromOverride) return fromOverride

  const fromEnv = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim()
  if (fromEnv) return fromEnv

  throw new Error(
    'Google Ads developer token is required. Enter it in the Developer Token field or set GOOGLE_ADS_DEVELOPER_TOKEN.'
  )
}

function formatCustomerId(customerId: string): string {
  return customerId.replace(/-/g, '')
}

function isLoginCustomerIdPermissionError(errorText: string): boolean {
  return (
    errorText.includes('USER_PERMISSION_DENIED') ||
    errorText.includes('login-customer-id') ||
    errorText.includes('PERMISSION_DENIED')
  )
}

/**
 * Lists customer IDs accessible to the OAuth credential.
 */
async function listAccessibleCustomerIds(
  accessToken: string,
  developerToken: string
): Promise<string[]> {
  const listResponse = await fetch(LIST_ACCESSIBLE_CUSTOMERS_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
    },
  })

  const listData = await readJsonResponse<{ resourceNames?: string[] }>(
    listResponse,
    'Google Ads listAccessibleCustomers'
  )

  if (!listResponse.ok) {
    const errorMessage =
      (listData as { error?: { message?: string } })?.error?.message ??
      'Failed to list accessible Google Ads customers'
    throw new Error(errorMessage)
  }

  const resourceNames: string[] = listData.resourceNames ?? []
  return resourceNames.map((resourceName) => resourceName.replace('customers/', ''))
}

/**
 * Executes a GAQL search against a customer, optionally via a manager login-customer-id.
 */
async function executeGoogleAdsSearch(
  accessToken: string,
  developerToken: string,
  customerId: string,
  gaqlQuery: string,
  loginCustomerId?: string
): Promise<unknown> {
  const formattedCustomerId = formatCustomerId(customerId)
  const adsApiUrl = `https://googleads.googleapis.com/v22/customers/${formattedCustomerId}/googleAds:search`

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  }

  if (loginCustomerId) {
    headers['login-customer-id'] = formatCustomerId(loginCustomerId)
  }

  const adsResponse = await fetch(adsApiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: gaqlQuery.trim() }),
  })

  if (!adsResponse.ok) {
    const errorText = await adsResponse.text()
    logger.error('Google Ads OAuth API request failed', {
      status: adsResponse.status,
      error: errorText,
      customerId: formattedCustomerId,
      loginCustomerId: loginCustomerId ? formatCustomerId(loginCustomerId) : undefined,
    })
    throw new Error(`Google Ads API request failed: ${adsResponse.status} - ${errorText}`)
  }

  return readJsonResponse(adsResponse, 'Google Ads search')
}

/**
 * Executes a GAQL query against Google Ads using an OAuth workspace credential.
 * When accessing a client account under an MCC, pass managerCustomerId or rely on
 * automatic login-customer-id discovery from accessible accounts.
 */
export async function makeGoogleAdsOAuthRequest(
  credentialId: string,
  userId: string,
  customerId: string,
  gaqlQuery: string,
  managerCustomerId?: string,
  developerTokenOverride?: string
): Promise<unknown> {
  const requestId = generateRequestId()
  const developerToken = resolveGoogleAdsDeveloperToken(developerTokenOverride)

  const credential = await getCredential(requestId, credentialId, userId)
  if (!credential) {
    throw new Error('Google Ads credential not found')
  }

  const { accessToken } = await refreshTokenIfNeeded(requestId, credential, credentialId)
  if (!accessToken) {
    throw new Error('Failed to obtain Google Ads access token')
  }

  const formattedTargetId = formatCustomerId(customerId)

  if (managerCustomerId?.trim()) {
    return executeGoogleAdsSearch(
      accessToken,
      developerToken,
      formattedTargetId,
      gaqlQuery,
      managerCustomerId
    )
  }

  try {
    return await executeGoogleAdsSearch(
      accessToken,
      developerToken,
      formattedTargetId,
      gaqlQuery
    )
  } catch (error) {
    const err = toError(error)
    if (!isLoginCustomerIdPermissionError(err.message)) {
      throw err
    }

    logger.info(`[${requestId}] Attempting login-customer-id discovery for ${formattedTargetId}`)

    let accessibleIds: string[] = []
    try {
      accessibleIds = await listAccessibleCustomerIds(accessToken, developerToken)
    } catch (listError) {
      logger.warn(`[${requestId}] Failed to list accessible customers for login-customer-id discovery`, {
        error: toError(listError).message,
      })
      throw err
    }

    for (const loginCandidateId of accessibleIds) {
      const formattedLoginId = formatCustomerId(loginCandidateId)
      if (formattedLoginId === formattedTargetId) continue

      try {
        logger.info(`[${requestId}] Retrying with login-customer-id`, {
          loginCustomerId: formattedLoginId,
          customerId: formattedTargetId,
        })
        return await executeGoogleAdsSearch(
          accessToken,
          developerToken,
          formattedTargetId,
          gaqlQuery,
          formattedLoginId
        )
      } catch (retryError) {
        const retryErr = toError(retryError)
        if (!isLoginCustomerIdPermissionError(retryErr.message)) {
          throw retryErr
        }
      }
    }

    throw err
  }
}
