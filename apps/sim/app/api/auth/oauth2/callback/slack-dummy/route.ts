import { randomUUID } from 'node:crypto'
import { db } from '@sim/db'
import { account, credential, credentialMember } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/core/config/env'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { processCredentialDraft } from '@/lib/credentials/draft-processor'

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

    // Upsert Slack account
    let slackAccountId: string
    if (existing) {
      slackAccountId = existing.id
      await db.update(account).set(accountData).where(eq(account.id, existing.id))
      logger.info('Updated existing Slack account with both tokens', {
        accountId: existing.id,
        hasUserToken: !!userToken,
      })
    } else {
      slackAccountId = `slack_${session.user.id}_${Date.now()}`
      await db.insert(account).values({
        id: slackAccountId,
        userId: session.user.id,
        providerId: 'slack',
        ...accountData,
        createdAt: now,
      })
      logger.info('Created new Slack account with both tokens', {
        accountId: slackAccountId,
        hasUserToken: !!userToken,
      })
    }

    // Try to derive workspaceId from state payload (if provided)
    let workspaceId: string | null = null
    if (state) {
      try {
        const decoded = decodeURIComponent(state)
        const parsed = JSON.parse(decoded) as { workspaceId?: string } | null
        if (parsed && typeof parsed.workspaceId === 'string' && parsed.workspaceId.length > 0) {
          workspaceId = parsed.workspaceId
        }
      } catch {
        // state not in expected JSON format; ignore
      }
    }

    // Parse richer context from state for post-OAuth routing
    let origin: string | undefined
    let workflowId: string | undefined
    let knowledgeBaseId: string | undefined

    if (state) {
      try {
        const decoded = decodeURIComponent(state)
        const parsed = JSON.parse(decoded) as {
          workspaceId?: string
          origin?: string
          workflowId?: string
          knowledgeBaseId?: string
          redirectPath?: string
        } | null

        if (parsed) {
          if (!workspaceId && typeof parsed.workspaceId === 'string' && parsed.workspaceId.length > 0) {
            workspaceId = parsed.workspaceId
          }
          if (typeof parsed.origin === 'string') {
            origin = parsed.origin
          }
          if (typeof parsed.workflowId === 'string') {
            workflowId = parsed.workflowId
          }
          if (typeof parsed.knowledgeBaseId === 'string') {
            knowledgeBaseId = parsed.knowledgeBaseId
          }

          if (!parsed.origin && parsed.redirectPath) {
            // Legacy shape: treat explicit redirectPath as integrations-style redirect
            origin = 'integrations'
          }
        }
      } catch {
        // state not JSON – ignore, we'll fall back to workspace/home redirect
      }
    }

    if (workspaceId) {
      try {
        const credentialId = randomUUID()

        await db.insert(credential).values({
          id: credentialId,
          workspaceId,
          type: 'oauth',
          displayName: teamName,
          description: null,
          providerId: 'slack',
          accountId: slackAccountId,
          envKey: null,
          envOwnerUserId: null,
          createdBy: session.user.id,
          createdAt: now,
          updatedAt: now,
        })

        await db.insert(credentialMember).values({
          id: randomUUID(),
          credentialId,
          userId: session.user.id,
          role: 'admin',
          status: 'active',
          joinedAt: now,
          invitedBy: session.user.id,
          createdAt: now,
          updatedAt: now,
        })

        logger.info('Created Slack credential and membership for workspace', {
          workspaceId,
          credentialId,
          accountId: slackAccountId,
        })
      } catch (err: any) {
        // Ignore duplicate-credential errors; everything else should be logged
        if (err?.code === '23505') {
          logger.warn('Slack credential already exists for this workspace/account', {
            workspaceId,
            accountId: slackAccountId,
          })
        } else {
          logger.error('Failed to create Slack credential for workspace', {
            workspaceId,
            accountId: slackAccountId,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    } else {
      logger.warn(
        'Slack OAuth callback: no workspaceId resolved from state; attempting to process credential draft instead',
        {
          userId: session.user.id,
          state,
        }
      )

      try {
        await processCredentialDraft({
          userId: session.user.id,
          providerId: 'slack',
          accountId: slackAccountId,
        })
      } catch (err: any) {
        logger.error('Slack OAuth callback: failed to process credential draft', {
          userId: session.user.id,
          accountId: slackAccountId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Decide where to send the user after OAuth based on origin context.
    if (origin === 'workflow' && workspaceId && workflowId) {
      logger.info('Slack OAuth callback: redirecting back to workflow page', {
        workspaceId,
        workflowId,
      })
      return NextResponse.redirect(`${baseUrl}/workspace/${workspaceId}/w/${workflowId}`)
    }

    if (origin === 'kb-connectors' && workspaceId && knowledgeBaseId) {
      logger.info('Slack OAuth callback: redirecting back to KB connectors page', {
        workspaceId,
        knowledgeBaseId,
      })
      return NextResponse.redirect(
        `${baseUrl}/workspace/${workspaceId}/knowledge/${knowledgeBaseId}`
      )
    }

    // Default: go to workspace home (integrations will be reachable from there)
    logger.info('Slack OAuth callback: redirecting back to workspace home', {
      workspaceId: workspaceId ?? 'unknown',
      origin: origin ?? 'unknown',
    })
    return NextResponse.redirect(
      workspaceId ? `${baseUrl}/workspace/${workspaceId}` : `${baseUrl}/workspace`
    )
  } catch (error) {
    logger.error('Error in Slack OAuth callback:', error)
    return NextResponse.redirect(`${baseUrl}/workspace?error=slack_callback_error`)
  }
}
