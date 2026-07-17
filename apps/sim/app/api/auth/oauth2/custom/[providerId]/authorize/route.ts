import { db } from '@sim/db'
import { workspace } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { authorizeCustomOAuthAppContract } from '@/lib/api/contracts/oauth-connections'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth/auth'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { isSameOrigin } from '@/lib/core/utils/validation'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { createConnectDraft } from '@/lib/credentials/connect-draft'
import { getCustomOAuthAppConfig, requiresCustomOAuthApp } from '@/lib/oauth/custom-app-config'
import { createCustomOAuthAppState, getOrganizationOAuthApp } from '@/lib/oauth/custom-apps'
import { getCanonicalScopesForProvider } from '@/lib/oauth/utils'
import { checkWorkspaceAccess } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('CustomOAuthAppAuthorize')

export const dynamic = 'force-dynamic'

/**
 * Browser-initiated entrypoint for linking an OAuth account through an
 * organization-scoped custom OAuth app (bypasses Better Auth's static
 * provider registration).
 */
export const GET = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ providerId: string }> }) => {
    const baseUrl = getBaseUrl()

    const session = await getSession()
    if (!session?.user?.id) {
      const loginUrl = new URL('/login', baseUrl)
      loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search)
      return NextResponse.redirect(loginUrl.toString())
    }
    const userId = session.user.id

    const parsed = await parseRequest(authorizeCustomOAuthAppContract, request, context)
    if (!parsed.success) return parsed.response

    const { providerId } = parsed.data.params
    const { workspaceId, returnUrl: requestedReturnUrl } = parsed.data.query

    if (!requiresCustomOAuthApp(providerId)) {
      logger.warn('Custom OAuth authorize called for non-custom provider', { providerId })
      return NextResponse.redirect(`${baseUrl}/workspace?error=oauth_unsupported_provider`)
    }

    const customConfig = getCustomOAuthAppConfig(providerId)
    if (!customConfig) {
      return NextResponse.redirect(`${baseUrl}/workspace?error=oauth_unsupported_provider`)
    }

    try {
      const access = await checkWorkspaceAccess(workspaceId, userId)
      if (!access.canWrite) {
        logger.warn('Workspace write access denied for custom OAuth authorize', {
          userId,
          workspaceId,
          providerId,
        })
        return NextResponse.redirect(`${baseUrl}/workspace?error=workspace_access_denied`)
      }

      const [ws] = await db
        .select({ organizationId: workspace.organizationId })
        .from(workspace)
        .where(eq(workspace.id, workspaceId))
        .limit(1)

      const organizationId = ws?.organizationId
      if (!organizationId) {
        logger.warn('Custom OAuth authorize requires an organization-owned workspace', {
          workspaceId,
          providerId,
        })
        return NextResponse.redirect(
          `${baseUrl}/workspace/${workspaceId}/integrations?error=custom_oauth_app_no_org`
        )
      }

      const orgApp = await getOrganizationOAuthApp(organizationId, customConfig.appKey)
      if (!orgApp) {
        logger.warn('Organization has not configured a custom OAuth app', {
          organizationId,
          providerId,
          appKey: customConfig.appKey,
        })
        return NextResponse.redirect(
          `${baseUrl}/workspace/${workspaceId}/integrations?error=custom_oauth_app_not_configured&provider=${encodeURIComponent(providerId)}`
        )
      }

      await createConnectDraft({ userId, workspaceId, providerId })

      const safeReturnUrl =
        requestedReturnUrl && isSameOrigin(requestedReturnUrl)
          ? requestedReturnUrl
          : `${baseUrl}/workspace/${workspaceId}/integrations`

      const state = await createCustomOAuthAppState({
        providerId,
        organizationId,
        workspaceId,
        userId,
        returnUrl: safeReturnUrl,
      })

      const redirectUri = `${baseUrl}/api/auth/oauth2/custom/${providerId}/callback`
      const scopes = getCanonicalScopesForProvider(providerId)

      const authorizeUrl = new URL(customConfig.authorizationUrl)
      authorizeUrl.searchParams.set('response_type', 'code')
      authorizeUrl.searchParams.set('client_id', orgApp.clientId)
      authorizeUrl.searchParams.set('redirect_uri', redirectUri)
      authorizeUrl.searchParams.set('state', state)
      if (scopes.length > 0) {
        authorizeUrl.searchParams.set('scope', scopes.join(' '))
      }

      logger.info('Initiating custom OAuth app authorization', {
        providerId,
        organizationId,
        workspaceId,
        appKey: customConfig.appKey,
      })

      return NextResponse.redirect(authorizeUrl.toString())
    } catch (error) {
      logger.error('Failed to initiate custom OAuth authorization', { providerId, error })
      return NextResponse.redirect(`${baseUrl}/workspace?error=oauth_link_failed`)
    }
  }
)
