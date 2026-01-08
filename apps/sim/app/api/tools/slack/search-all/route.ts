import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkHybridAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { authorizeCredentialUse } from '@/lib/auth/credential-access'
import { refreshAccessTokenIfNeeded } from '@/app/api/auth/oauth/utils'

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
    const validatedData = SlackSearchAllSchema.parse(body)

    // Resolve token: search.all requires user token (OAuth), not bot token
    // The tool execution system may have already resolved the credential to accessToken
    let accessToken: string | null = null

    // Check if bot token is provided (search.all doesn't support bot tokens)
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

    // Check if accessToken is a bot token
    if (validatedData.accessToken && validatedData.accessToken.startsWith('xoxb-')) {
      logger.warn(`[${requestId}] Bot token detected in accessToken - search.all requires user token`)
      return NextResponse.json(
        {
          success: false,
          error:
            'search.all API requires a user token (OAuth), not a bot token. Please use OAuth authentication.',
        },
        { status: 400 }
      )
    }

    // If credential ID is provided (not a token), resolve it to get OAuth token
    const credentialId = validatedData.credential || (validatedData.accessToken && !validatedData.accessToken.startsWith('xox') ? validatedData.accessToken : null)
    if (credentialId) {
      // This is a credential ID, not a token - resolve it
      const authz = await authorizeCredentialUse(request as any, {
        credentialId,
        workflowId: validatedData.workflowId,
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
      const resolvedToken = await refreshAccessTokenIfNeeded(
        credentialId,
        authz.credentialOwnerUserId,
        requestId
      )
      if (!resolvedToken) {
        logger.error(`[${requestId}] Failed to get access token`, {
          credentialId,
          userId: authz.credentialOwnerUserId,
        })
        return NextResponse.json(
          {
            success: false,
            error: 'Could not retrieve access token',
            authRequired: true,
          },
          { status: 401 }
        )
      }
      // Verify resolved token is not a bot token
      if (resolvedToken.startsWith('xoxb-')) {
        logger.warn(`[${requestId}] Resolved token is a bot token - search.all requires user token`)
        return NextResponse.json(
          {
            success: false,
            error:
              'The credential resolves to a bot token, but search.all API requires a user token (OAuth). Please use OAuth authentication.',
          },
          { status: 400 }
        )
      }
      accessToken = resolvedToken
      logger.info(`[${requestId}] Using OAuth token for Slack search.all (resolved from credential)`)
    } else if (validatedData.accessToken && validatedData.accessToken.startsWith('xoxp-')) {
      // Direct user token provided (OAuth user token)
      accessToken = validatedData.accessToken.trim()
      logger.info(`[${requestId}] Using provided user token for Slack search.all`)
    } else {
      logger.warn(`[${requestId}] Missing valid access token or credential for search.all`, {
        hasAccessToken: !!validatedData.accessToken,
        hasCredential: !!validatedData.credential,
        accessTokenType: validatedData.accessToken ? (validatedData.accessToken.startsWith('xoxb-') ? 'bot' : validatedData.accessToken.startsWith('xoxp-') ? 'user' : 'unknown') : 'none',
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

    if (!accessToken) {
      logger.warn(`[${requestId}] Missing Slack access token for search.all`)
      return NextResponse.json(
        {
          success: false,
          error: 'Slack access token is required. Provide credential or OAuth accessToken in the request body.',
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
      })

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
