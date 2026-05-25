import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { resolveSessionOrInternalUserId } from '@/lib/auth/hybrid'
import { validateAlphanumericId } from '@/lib/core/security/input-validation'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { getScopesForService } from '@/lib/oauth/utils'
import { toError } from '@sim/utils/errors'
import {
  getCredential,
  refreshTokenIfNeeded,
  resolveOAuthAccountId,
} from '@/app/api/auth/oauth/utils'
import { readJsonResponse } from '@/app/api/google-ads/query/read-json-response'
import { resolveGoogleAdsDeveloperToken } from '@/app/api/google-ads/query/google-ads-oauth-api'

export const dynamic = 'force-dynamic'

const logger = createLogger('GoogleAdsCustomersAPI')

interface GoogleAdsCustomerOption {
  id: string
  label: string
}

/**
 * Lists Google Ads customer accounts accessible to the given OAuth credential.
 */
export const GET = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()

  try {
    const auth = await resolveSessionOrInternalUserId(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json(
        { error: auth.error ?? 'User not authenticated' },
        { status: 401 }
      )
    }
    const userId = auth.userId

    const credentialId = new URL(request.url).searchParams.get('credentialId')
    if (!credentialId) {
      return NextResponse.json({ error: 'Credential ID is required' }, { status: 400 })
    }

    const credentialIdValidation = validateAlphanumericId(credentialId, 'credentialId', 255)
    if (!credentialIdValidation.isValid) {
      return NextResponse.json({ error: credentialIdValidation.error }, { status: 400 })
    }

    const resolved = await resolveOAuthAccountId(credentialId)
    if (!resolved) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    }

    if (resolved.workspaceId) {
      const { getUserEntityPermissions } = await import('@/lib/workspaces/permissions/utils')
      const perm = await getUserEntityPermissions(userId, 'workspace', resolved.workspaceId)
      if (perm === null) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const credential = await getCredential(requestId, credentialId, userId)
    if (!credential) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    }

    const developerTokenParam = new URL(request.url).searchParams.get('developerToken')
    let developerToken: string
    try {
      developerToken = resolveGoogleAdsDeveloperToken(developerTokenParam ?? undefined)
    } catch (tokenError) {
      const err = toError(tokenError)
      return NextResponse.json({ error: err.message }, { status: 400 })
    }

    const { accessToken } = await refreshTokenIfNeeded(requestId, credential, credentialId)
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to obtain Google Ads access token' }, { status: 401 })
    }

    const listResponse = await fetch(
      'https://googleads.googleapis.com/v19/customers:listAccessibleCustomers',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
        },
      }
    )

    const listData = await readJsonResponse<{
      resourceNames?: string[]
      error?: { message?: string; details?: Array<{ errors?: Array<{ message?: string }> }> }
    }>(listResponse, 'Google Ads listAccessibleCustomers')

    if (!listResponse.ok) {
      const errorMessage =
        listData?.error?.message ??
        listData?.error?.details?.[0]?.errors?.[0]?.message ??
        'Failed to list Google Ads customers'
      logger.error(`[${requestId}] listAccessibleCustomers failed`, { error: errorMessage })
      return NextResponse.json({ error: errorMessage }, { status: listResponse.status })
    }

    const resourceNames: string[] = listData.resourceNames ?? []
    const customers: GoogleAdsCustomerOption[] = resourceNames.map((resourceName) => {
      const customerId = resourceName.replace('customers/', '')
      return {
        id: customerId,
        label: customerId,
      }
    })

    return NextResponse.json({
      success: true,
      customers,
      count: customers.length,
    })
  } catch (error) {
    const err = toError(error)
    logger.error(`[${requestId}] Failed to list Google Ads customers`, { error: err.message })
    return NextResponse.json(
      { success: false, error: err.message, details: 'Failed to list Google Ads customers' },
      { status: 500 }
    )
  }
})
