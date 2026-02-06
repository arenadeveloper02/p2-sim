import { db } from '@sim/db'
import { account } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/core/config/env'
import { getBaseUrl } from '@/lib/core/utils/urls'

export const dynamic = 'force-dynamic'

const logger = createLogger('SlackOAuthCallback')

/**
 * Custom Slack OAuth callback to extract both bot and user tokens
 * This intercepts the OAuth response to extract the user token from authed_user.access_token
 * and stores it in the idToken field, while storing the bot token in accessToken.
 */
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized attempt to complete Slack OAuth')
      return NextResponse.redirect(`${baseUrl}/workspace?error=unauthorized`)
    }

    const { searchParams } = request.nextUrl
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    const state = searchParams.get('state')

    if (error) {
      logger.error('Slack OAuth error:', { error })
      return NextResponse.redirect(
        `${baseUrl}/workspace?error=slack_oauth_error&message=${encodeURIComponent(error)}`
      )
    }

    if (!code) {
      logger.error('No code received from Slack')
      return NextResponse.redirect(`${baseUrl}/workspace?error=slack_no_code`)
    }

    // Get client credentials - ensure no quotes
    const rawClientId = env.SLACK_CLIENT_ID
    const rawClientSecret = env.SLACK_CLIENT_SECRET

    if (!rawClientId || !rawClientSecret) {
      logger.error('Slack credentials not configured')
      return NextResponse.redirect(`${baseUrl}/workspace?error=slack_config_error`)
    }

    // Clean client ID and secret - remove quotes and whitespace
    const clientId = rawClientId.trim().replace(/^["']|["']$/g, '')
    const clientSecret = rawClientSecret.trim().replace(/^["']|["']$/g, '')

    logger.info('Exchanging Slack OAuth code for tokens', {
      hasCode: !!code,
      hasState: !!state,
      clientIdPrefix: clientId?.substring(0, 10),
      clientIdLength: clientId?.length,
    })

    // Exchange code for tokens
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: `${baseUrl}/api/auth/oauth2/callback/slack`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      logger.error('Failed to exchange code for token:', {
        status: tokenResponse.status,
        body: errorText,
      })
      return NextResponse.redirect(`${baseUrl}/workspace?error=slack_token_error`)
    }

    const tokenData = await tokenResponse.json()

    if (!tokenData.ok) {
      logger.error('Slack token exchange returned error:', {
        error: tokenData.error,
        fullResponse: tokenData,
      })
      return NextResponse.redirect(
        `${baseUrl}/workspace?error=slack_token_error&message=${encodeURIComponent(tokenData.error || 'Unknown error')}`
      )
    }

    // Extract both tokens
    const botToken = tokenData.access_token // Bot token (xoxb-...)
    const userToken = tokenData.authed_user?.access_token // User token (xoxp-...)

    logger.info('Slack OAuth tokens extracted:', {
      hasBotToken: !!botToken,
      hasUserToken: !!userToken,
      botTokenPrefix: botToken?.substring(0, 10),
      userTokenPrefix: userToken?.substring(0, 10),
      authedUserExists: !!tokenData.authed_user,
      authedUserKeys: tokenData.authed_user ? Object.keys(tokenData.authed_user) : [],
      fullTokenDataKeys: Object.keys(tokenData),
    })

    if (!botToken) {
      logger.error('No bot token in Slack OAuth response')
      return NextResponse.redirect(`${baseUrl}/workspace?error=slack_no_bot_token`)
    }

    // Get team and user info using bot token
    const authTestResponse = await fetch('https://slack.com/api/auth.test', {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
    })

    if (!authTestResponse.ok) {
      logger.error('Failed to get Slack team info')
      return NextResponse.redirect(`${baseUrl}/workspace?error=slack_auth_test_failed`)
    }

    const authTestData = await authTestResponse.json()

    if (!authTestData.ok) {
      logger.error('Slack auth.test returned error:', { error: authTestData.error })
      return NextResponse.redirect(`${baseUrl}/workspace?error=slack_auth_test_error`)
    }

    const teamId = authTestData.team_id || 'unknown'
    const userId = authTestData.user_id || authTestData.bot_id || 'bot'
    const teamName = authTestData.team || 'Slack Workspace'
    const uniqueId = `slack-bot-${Date.now()}`

    // Find or create account
    const existing = await db.query.account.findFirst({
      where: and(
        eq(account.userId, session.user.id),
        eq(account.providerId, 'slack'),
        eq(account.accountId, uniqueId)
      ),
    })

    const now = new Date()
    const accountData = {
      accountId: uniqueId,
      accessToken: botToken, // Store bot token in accessToken
      idToken: userToken || null, // Store user token in idToken (if available)
      refreshToken: tokenData.refresh_token || null,
      scope: tokenData.scope || '',
      accessTokenExpiresAt: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : null,
      updatedAt: now,
    }

    if (existing) {
      await db.update(account).set(accountData).where(eq(account.id, existing.id))
      logger.info('Updated existing Slack account with both tokens', {
        accountId: existing.id,
        hasUserToken: !!userToken,
      })
    } else {
      await db.insert(account).values({
        id: `slack_${session.user.id}_${Date.now()}`,
        userId: session.user.id,
        providerId: 'slack',
        ...accountData,
        createdAt: now,
      })
      logger.info('Created new Slack account with both tokens', {
        hasUserToken: !!userToken,
      })
    }

    // Redirect to workspace with success
    return NextResponse.redirect(`${baseUrl}/workspace?slack_connected=true`)
  } catch (error) {
    logger.error('Error in Slack OAuth callback:', error)
    return NextResponse.redirect(`${baseUrl}/workspace?error=slack_callback_error`)
  }
}
