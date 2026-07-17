import { db } from '@sim/db'
import { account } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { customOAuthAppCallbackContract } from '@/lib/api/contracts/oauth-connections'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth/auth'
import { processCredentialDraft } from '@/lib/credentials/draft-processor'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { isSameOrigin } from '@/lib/core/utils/validation'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  consumeCustomOAuthAppState,
  getCustomOAuthAppConfig,
  getOrganizationOAuthApp,
  requiresCustomOAuthApp,
} from '@/lib/oauth/custom-apps'
import { safeAccountInsert } from '@/app/api/auth/oauth/utils'

const logger = createLogger('CustomOAuthAppCallback')

export const dynamic = 'force-dynamic'

interface ZoomUserProfile {
  id: string | number
  first_name?: string
  last_name?: string
  email?: string
  verified?: number
  pic_url?: string
}

/**
 * OAuth callback for organization-scoped custom OAuth apps. Exchanges the
 * authorization code using the org's client credentials, persists the
 * `account` row, and runs `processCredentialDraft` to materialize the
 * workspace credential.
 */
export const GET = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ providerId: string }> }) => {
    const baseUrl = getBaseUrl()

    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.redirect(`${baseUrl}/workspace?error=unauthorized`)
    }

    const parsed = await parseRequest(customOAuthAppCallbackContract, request, context)
    if (!parsed.success) return parsed.response

    const { providerId } = parsed.data.params
    const { code, state, error: providerError } = parsed.data.query

    if (!requiresCustomOAuthApp(providerId)) {
      return NextResponse.redirect(`${baseUrl}/workspace?error=oauth_unsupported_provider`)
    }

    const customConfig = getCustomOAuthAppConfig(providerId)
    if (!customConfig) {
      return NextResponse.redirect(`${baseUrl}/workspace?error=oauth_unsupported_provider`)
    }

    const fallbackRedirect = `${baseUrl}/workspace`

    if (providerError) {
      logger.warn('Provider returned OAuth error in custom app callback', {
        providerId,
        providerError,
      })
      return NextResponse.redirect(`${fallbackRedirect}?error=oauth_provider_denied`)
    }

    if (!state || !code) {
      logger.error('Missing state or code in custom OAuth callback', { providerId })
      return NextResponse.redirect(`${fallbackRedirect}?error=oauth_missing_params`)
    }

    const stateRecord = await consumeCustomOAuthAppState(state)
    if (!stateRecord) {
      logger.error('Invalid or expired custom OAuth state', { providerId })
      return NextResponse.redirect(`${fallbackRedirect}?error=oauth_state_invalid`)
    }

    if (stateRecord.providerId !== providerId) {
      logger.error('Custom OAuth state provider mismatch', {
        expected: stateRecord.providerId,
        received: providerId,
      })
      return NextResponse.redirect(`${fallbackRedirect}?error=oauth_state_invalid`)
    }

    if (stateRecord.userId !== session.user.id) {
      logger.error('Custom OAuth state user mismatch', {
        stateUserId: stateRecord.userId,
        sessionUserId: session.user.id,
      })
      return NextResponse.redirect(`${fallbackRedirect}?error=unauthorized`)
    }

    const returnUrl =
      stateRecord.returnUrl && isSameOrigin(stateRecord.returnUrl)
        ? stateRecord.returnUrl
        : `${baseUrl}/workspace/${stateRecord.workspaceId}/integrations`

    try {
      const orgApp = await getOrganizationOAuthApp(
        stateRecord.organizationId,
        customConfig.appKey
      )
      if (!orgApp) {
        logger.error('Organization custom OAuth app missing at callback', {
          organizationId: stateRecord.organizationId,
          providerId,
        })
        const errorUrl = new URL(returnUrl)
        errorUrl.searchParams.set('error', 'custom_oauth_app_not_configured')
        return NextResponse.redirect(errorUrl.toString())
      }

      const redirectUri = `${baseUrl}/api/auth/oauth2/custom/${providerId}/callback`
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      })

      const basicAuth = Buffer.from(`${orgApp.clientId}:${orgApp.clientSecret}`).toString('base64')
      const tokenResponse = await fetch(customConfig.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
        body: tokenBody.toString(),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        logger.error('Custom OAuth token exchange failed', {
          providerId,
          status: tokenResponse.status,
          body: errorText,
        })
        const errorUrl = new URL(returnUrl)
        errorUrl.searchParams.set('error', 'oauth_token_error')
        return NextResponse.redirect(errorUrl.toString())
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token?: string
        refresh_token?: string
        expires_in?: number
        scope?: string
      }

      const accessToken = tokenData.access_token
      if (!accessToken) {
        logger.error('No access token in custom OAuth token response', { providerId })
        const errorUrl = new URL(returnUrl)
        errorUrl.searchParams.set('error', 'oauth_no_token')
        return NextResponse.redirect(errorUrl.toString())
      }

      let stableAccountId = `custom-${providerId}-${session.user.id}`
      let displayEmail: string | undefined
      let idToken: string | undefined

      if (customConfig.userInfoUrl) {
        const profileResponse = await fetch(customConfig.userInfoUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (profileResponse.ok) {
          const profile = (await profileResponse.json()) as ZoomUserProfile
          stableAccountId = `${profile.id.toString()}-${generateId()}`
          displayEmail = profile.email
          idToken = JSON.stringify(profile)
        } else {
          logger.warn('Failed to fetch user info after custom OAuth token exchange', {
            providerId,
            status: profileResponse.status,
          })
        }
      }

      const expiresIn = tokenData.expires_in ?? 3600
      const now = new Date()
      const accessTokenExpiresAt = new Date(now.getTime() + expiresIn * 1000)

      const existing = await db.query.account.findFirst({
        where: and(
          eq(account.userId, session.user.id),
          eq(account.providerId, providerId),
          eq(account.accountId, stableAccountId)
        ),
      })

      const accountData = {
        accessToken,
        refreshToken: tokenData.refresh_token ?? null,
        scope: tokenData.scope ?? '',
        accessTokenExpiresAt,
        idToken: idToken ?? null,
        updatedAt: now,
      }

      let persistedAccountId: string

      if (existing) {
        await db.update(account).set(accountData).where(eq(account.id, existing.id))
        persistedAccountId = existing.id
        logger.info('Updated existing custom OAuth account', {
          providerId,
          accountId: existing.id,
        })
      } else {
        const newAccountId = `${providerId}_${session.user.id}_${Date.now()}`
        await safeAccountInsert(
          {
            id: newAccountId,
            userId: session.user.id,
            providerId,
            accountId: stableAccountId,
            accessToken: accountData.accessToken,
            refreshToken: accountData.refreshToken ?? undefined,
            scope: accountData.scope,
            idToken: accountData.idToken ?? undefined,
            accessTokenExpiresAt: accountData.accessTokenExpiresAt,
            createdAt: now,
            updatedAt: now,
          },
          { provider: providerId, identifier: displayEmail ?? stableAccountId }
        )

        const persisted =
          (await db.query.account.findFirst({
            where: and(
              eq(account.userId, session.user.id),
              eq(account.providerId, providerId),
              eq(account.accountId, stableAccountId)
            ),
          })) ?? null

        if (!persisted) {
          logger.error('Failed to persist custom OAuth account after insert', { providerId })
          const errorUrl = new URL(returnUrl)
          errorUrl.searchParams.set('error', 'oauth_store_error')
          return NextResponse.redirect(errorUrl.toString())
        }
        persistedAccountId = persisted.id
      }

      try {
        await processCredentialDraft({
          userId: session.user.id,
          providerId,
          accountId: persistedAccountId,
        })
      } catch (error) {
        logger.error('Failed to process credential draft for custom OAuth app', {
          providerId,
          error,
        })
      }

      const successUrl = new URL(returnUrl)
      successUrl.searchParams.set('oauth_connected', providerId)
      return NextResponse.redirect(successUrl.toString())
    } catch (error) {
      logger.error('Error in custom OAuth callback', { providerId, error })
      const errorUrl = new URL(returnUrl)
      errorUrl.searchParams.set('error', 'oauth_callback_error')
      return NextResponse.redirect(errorUrl.toString())
    }
  }
)
