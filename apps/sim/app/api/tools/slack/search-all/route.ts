import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authorizeCredentialUse } from '@/lib/auth/credential-access'
import { checkHybridAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { getCredential } from '@/app/api/auth/oauth/utils'

export const dynamic = 'force-dynamic'

const logger = createLogger('SlackSearchAllAPI')

const SlackSearchAllSchema = z.object({
  accessToken: z.string().optional().nullable(), // Can be credential ID or actual token
  credential: z.string().optional().nullable(), // Credential ID
  botToken: z.string().optional().nullable(), // Bot token (not supported for search.all)
  query: z.string().min(1, 'Query is required'),
  highlight: z.boolean().optional().nullable(),
  page: z.coerce.number().int().min(1).optional().nullable(),
  sort: z.enum(['score', 'timestamp']).optional().nullable(),
  sort_dir: z.enum(['asc', 'desc']).optional().nullable(),
  workflowId: z.string().optional().nullable(),
})

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const authResult = await checkHybridAuth(request, { requireWorkflowId: false })

    if (!authResult.success) {
      logger.warn(`[${requestId}] Unauthorized Slack search.all attempt: ${authResult.error}`)
      return NextResponse.json(
        {
          success: false,
          error: authResult.error || 'Authentication required',
        },
        { status: 401 }
      )
    }

    logger.info(
      `[${requestId}] Authenticated Slack search.all request via ${authResult.authType}`,
      {
        userId: authResult.userId,
      }
    )

    const body = await request.json()

    logger.info(`[${requestId}] Raw request body received:`, {
      hasAccessToken: !!body.accessToken,
      accessTokenPrefix: body.accessToken?.substring(0, 10) || 'none',
      accessTokenLength: body.accessToken?.length || 0,
      accessTokenType: body.accessToken
        ? body.accessToken.startsWith('xoxb-')
          ? 'bot'
          : body.accessToken.startsWith('xoxp-')
            ? 'user'
            : body.accessToken.startsWith('xoxa-')
              ? 'app'
              : 'unknown_or_credential_id'
        : 'none',
      hasCredential: !!body.credential,
      credentialValue: body.credential?.substring(0, 20) || 'none',
      credentialType: body.credential
        ? body.credential.startsWith('xoxb-')
          ? 'bot_token'
          : body.credential.startsWith('xoxp-')
            ? 'user_token'
            : body.credential.startsWith('xoxa-')
              ? 'app_token'
              : 'credential_id'
        : 'none',
      hasBotToken: !!body.botToken,
      botTokenPrefix: body.botToken?.substring(0, 10) || 'none',
      query: body.query?.substring(0, 50) || 'none',
    })

    const validatedData = SlackSearchAllSchema.parse(body)

    logger.info(`[${requestId}] After validation:`, {
      hasAccessToken: !!validatedData.accessToken,
      accessTokenPrefix: validatedData.accessToken?.substring(0, 10) || 'none',
      accessTokenType: validatedData.accessToken
        ? validatedData.accessToken.startsWith('xoxb-')
          ? 'bot'
          : validatedData.accessToken.startsWith('xoxp-')
            ? 'user'
            : validatedData.accessToken.startsWith('xoxa-')
              ? 'app'
              : 'unknown'
        : 'none',
      hasCredential: !!validatedData.credential,
      hasBotToken: !!validatedData.botToken,
    })

    // Resolve token: search.all requires user token (OAuth), not bot token
    // The tool execution system may have already resolved the credential to accessToken
    let accessToken: string | null = null

    // Check if bot token is provided directly (search.all doesn't support bot tokens)
    if (validatedData.botToken) {
      logger.warn(`[${requestId}] Bot token provided for search.all - this API requires user token`)
      return NextResponse.json(
        {
          success: false,
          error:
            'search.all API requires a user token (OAuth), not a bot token. Please use OAuth authentication.',
        },
        { status: 400 }
      )
    }

    // Check if we already have a user token (xoxp-)
    if (validatedData.accessToken?.startsWith('xoxp-')) {
      // Direct user token provided (OAuth user token)
      accessToken = validatedData.accessToken.trim()
      logger.info(`[${requestId}] Using provided user token for Slack search.all`)
    } else {
      // Need to resolve credential ID to get user token from database
      // If accessToken is a bot token, we still need to resolve via credential ID
      const credentialId =
        validatedData.credential ||
        (validatedData.accessToken && !validatedData.accessToken.startsWith('xox')
          ? validatedData.accessToken
          : null)
      
      // If accessToken is a bot token but we don't have a credential ID, reject it
      if (validatedData.accessToken?.startsWith('xoxb-') && !credentialId) {
        logger.warn(
          `[${requestId}] Bot token detected in accessToken and no credential ID to resolve - search.all requires user token`
        )
        return NextResponse.json(
          {
            success: false,
            error:
              'search.all API requires a user token (OAuth), not a bot token. Please use OAuth authentication.',
          },
          { status: 400 }
        )
      }
      
      logger.info(`[${requestId}] Credential resolution check:`, {
        hasCredential: !!validatedData.credential,
        credentialValue: validatedData.credential?.substring(0, 30) || 'none',
        hasAccessToken: !!validatedData.accessToken,
        accessTokenValue: validatedData.accessToken?.substring(0, 30) || 'none',
        accessTokenStartsWithXox: validatedData.accessToken?.startsWith('xox') || false,
        resolvedCredentialId: credentialId?.substring(0, 30) || 'none',
      })
      
      if (credentialId) {
        // This is a credential ID, not a token - resolve it
        logger.info(`[${requestId}] Attempting to authorize credential use:`, {
          credentialId: credentialId.substring(0, 30),
          hasWorkflowId: !!validatedData.workflowId,
        })
        
        const authz = await authorizeCredentialUse(request as any, {
          credentialId,
          workflowId: validatedData.workflowId,
        })
        
        logger.info(`[${requestId}] Credential authorization result:`, {
          ok: authz.ok,
          error: authz.error,
          hasCredentialOwnerUserId: !!authz.credentialOwnerUserId,
          credentialOwnerUserId: authz.credentialOwnerUserId?.substring(0, 30) || 'none',
        })
        
        if (!authz.ok || !authz.credentialOwnerUserId) {
          logger.warn(`[${requestId}] Unauthorized credential use: ${authz.error}`)
          return NextResponse.json(
            {
              success: false,
              error: authz.error || 'Unauthorized',
            },
            { status: 403 }
          )
        }
        
        // Get credential directly from database to access idToken field
        const credential = await getCredential(requestId, credentialId, authz.credentialOwnerUserId)
        
        if (!credential) {
          logger.error(`[${requestId}] Credential not found in database`, {
            credentialId,
            userId: authz.credentialOwnerUserId,
          })
          return NextResponse.json(
            {
              success: false,
              error: 'Credential not found',
            },
            { status: 404 }
          )
        }
        
        logger.info(`[${requestId}] Credential retrieved from database:`, {
          credentialId,
          providerId: credential.providerId,
          hasIdToken: !!credential.idToken,
          idTokenPrefix: credential.idToken?.substring(0, 10) || 'none',
          idTokenType: credential.idToken?.startsWith('xoxp-')
            ? 'user'
            : credential.idToken?.startsWith('xoxb-')
              ? 'bot'
              : 'unknown',
          hasAccessToken: !!credential.accessToken,
          accessTokenPrefix: credential.accessToken?.substring(0, 10) || 'none',
        })
        
        // For Slack, get user token from idToken field (stored during OAuth callback)
        if (credential.providerId === 'slack' && credential.idToken?.startsWith('xoxp-')) {
          accessToken = credential.idToken
          logger.info(`[${requestId}] Using Slack user token from idToken field in database`)
        } else if (credential.providerId === 'slack' && credential.accessToken?.startsWith('xoxp-')) {
          // Fallback: accessToken might be user token if idToken is not set
          accessToken = credential.accessToken
          logger.info(`[${requestId}] Using Slack user token from accessToken field (fallback)`)
        } else {
          logger.warn(
            `[${requestId}] No user token found in credential - search.all requires user token`,
            {
              credentialId,
              hasIdToken: !!credential.idToken,
              idTokenType: credential.idToken?.startsWith('xoxb-') ? 'bot' : 'unknown',
              hasAccessToken: !!credential.accessToken,
              accessTokenType: credential.accessToken?.startsWith('xoxb-') ? 'bot' : 'unknown',
            }
          )
          return NextResponse.json(
            {
              success: false,
              error:
                'The credential does not have a user token. Please reconnect your Slack account to get a user token for search.all API.',
            },
            { status: 400 }
          )
        }
      } else {
        logger.warn(`[${requestId}] Missing valid access token or credential for search.all`, {
          hasAccessToken: !!validatedData.accessToken,
          hasCredential: !!validatedData.credential,
          accessTokenType: validatedData.accessToken
            ? validatedData.accessToken.startsWith('xoxb-')
              ? 'bot'
              : validatedData.accessToken.startsWith('xoxp-')
                ? 'user'
                : 'unknown'
            : 'none',
        })
        return NextResponse.json(
          {
            success: false,
            error:
              'Slack access token (OAuth user token) is required. search.all API requires user authentication, not bot token.',
          },
          { status: 400 }
        )
      }
    }

    if (!accessToken) {
      logger.warn(`[${requestId}] Missing Slack access token for search.all`)
      return NextResponse.json(
        {
          success: false,
          error:
            'Slack access token is required. Provide credential or OAuth accessToken in the request body.',
        },
        { status: 400 }
      )
    }

    // Build form-encoded body for Slack API
    const formData = new URLSearchParams()
    formData.append('query', validatedData.query)

    if (typeof validatedData.highlight === 'boolean') {
      formData.append('highlight', String(validatedData.highlight))
    }

    if (validatedData.page != null) {
      formData.append('page', String(validatedData.page))
    }

    if (validatedData.sort) {
      formData.append('sort', validatedData.sort)
    }

    if (validatedData.sort_dir) {
      formData.append('sort_dir', validatedData.sort_dir)
    }

    // Extract channel name from query if present (for logging)
    const channelMatch = validatedData.query.match(/in:(\S+)/)
    const channelInQuery = channelMatch ? channelMatch[1] : null

    logger.info(`[${requestId}] Executing Slack search.all`, {
      query: validatedData.query,
      queryLength: validatedData.query.length,
      hasChannel: validatedData.query.includes('in:'),
      channelInQuery: channelInQuery, // Channel name from query (e.g., "general" from "in:general")
      hasHighlight: typeof validatedData.highlight === 'boolean',
      page: validatedData.page,
      sort: validatedData.sort,
      sort_dir: validatedData.sort_dir,
    })

    const slackResponse = await fetch('https://slack.com/api/search.all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData.toString(),
    })

    const data = await slackResponse.json()

    // Log channel information from search results
    if (data.ok && data.messages?.matches) {
      const channelsInResults: Array<{ channelId?: string; channelName?: string }> = []
      data.messages.matches.forEach((match: any) => {
        if (match.channel) {
          if (typeof match.channel === 'object') {
            channelsInResults.push({
              channelId: match.channel.id,
              channelName: match.channel.name,
            })
          } else {
            channelsInResults.push({ channelId: match.channel })
          }
        }
      })
      if (channelsInResults.length > 0) {
        logger.info(`[${requestId}] Channels found in search results:`, {
          channels: channelsInResults,
          uniqueChannels: Array.from(
            new Set(channelsInResults.map((ch) => ch.channelId || ch.channelName))
          ),
        })
      }
    }

    if (!slackResponse.ok || !data.ok) {
      logger.error(`[${requestId}] Slack search.all API error`, {
        status: slackResponse.status,
        statusText: slackResponse.statusText,
        error: data.error,
        needed: (data as any).needed,
        provided: (data as any).provided,
      })

      // Handle missing_scope error specifically
      if (data.error === 'missing_scope') {
        const needed = (data as any).needed
        const provided = (data as any).provided
        return NextResponse.json(
          {
            success: false,
            error: `Missing required Slack scope: ${needed || 'unknown'}. Please reconnect your Slack account to grant the necessary permissions.`,
            details: {
              needed,
              provided,
              hint: 'You may need to reinstall the Slack app with updated permissions.',
            },
          },
          { status: 403 }
        )
      }

      return NextResponse.json(
        {
          success: false,
          error:
            data.error || `Slack API error: ${slackResponse.status} ${slackResponse.statusText}`,
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        output: {
          query: validatedData.query, // Return the query we sent, not Slack's processed version
          files: data.files,
          messages: data.messages,
          posts: data.posts,
          raw: data,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error(`[${requestId}] Unexpected error in Slack search.all`, {
      error,
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error while searching Slack',
      },
      { status: 500 }
    )
  }
}
