import { NextResponse } from 'next/server'
import { authorizeCredentialUse } from '@/lib/auth/credential-access'
import { createLogger } from '@/lib/logs/console/logger'
import { SlackRateLimitHandler } from '@/lib/slack/rate-limit-handler'
import { generateRequestId } from '@/lib/utils'
import { refreshAccessTokenIfNeeded } from '@/app/api/auth/oauth/utils'

export const dynamic = 'force-dynamic'

const logger = createLogger('SlackChannelsAPI')

interface SlackChannel {
  id: string
  name: string
  is_private: boolean
  is_archived: boolean
  is_member: boolean
  is_general?: boolean
  is_channel?: boolean
  is_group?: boolean
  is_mpim?: boolean
  is_im?: boolean
}

export async function POST(request: Request) {
  try {
    const requestId = generateRequestId()
    const body = await request.json()
    const { credential, workflowId } = body

    if (!credential) {
      logger.error('Missing credential in request')
      return NextResponse.json({ error: 'Credential is required' }, { status: 400 })
    }

    let accessToken: string
    let isBotToken = false

    if (credential.startsWith('xoxb-')) {
      accessToken = credential
      isBotToken = true
      logger.info('Using direct bot token for Slack API')
    } else {
      const authz = await authorizeCredentialUse(request as any, {
        credentialId: credential,
        workflowId,
      })
      if (!authz.ok || !authz.credentialOwnerUserId) {
        return NextResponse.json({ error: authz.error || 'Unauthorized' }, { status: 403 })
      }
      const resolvedToken = await refreshAccessTokenIfNeeded(
        credential,
        authz.credentialOwnerUserId,
        requestId
      )
      if (!resolvedToken) {
        logger.error('Failed to get access token', {
          credentialId: credential,
          userId: authz.credentialOwnerUserId,
        })
        return NextResponse.json(
          {
            error: 'Could not retrieve access token',
            authRequired: true,
          },
          { status: 401 }
        )
      }
      accessToken = resolvedToken
      logger.info('Using OAuth token for Slack API')
    }

    let data
    try {
      data = await fetchSlackChannels(accessToken, true)
      logger.info('Successfully fetched channels including private channels')
    } catch (error) {
      if (isBotToken) {
        logger.warn(
          'Failed to fetch private channels with bot token, falling back to public channels only:',
          (error as Error).message
        )
        try {
          data = await fetchSlackChannels(accessToken, false)
          logger.info('Successfully fetched public channels only')
        } catch (fallbackError) {
          logger.error('Failed to fetch channels even with public-only fallback:', fallbackError)
          return NextResponse.json(
            { error: `Slack API error: ${(fallbackError as Error).message}` },
            { status: 400 }
          )
        }
      } else {
        logger.error('Slack API error with OAuth token:', error)
        return NextResponse.json(
          { error: `Slack API error: ${(error as Error).message}` },
          { status: 400 }
        )
      }
    }

    // Filter to only active channels (not archived)
    const channels = (data.channels || [])
      .filter((channel: SlackChannel) => {
        // Only include active (non-archived) channels
        const isActive = !channel.is_archived

        if (!isActive) {
          logger.debug(
            `Filtering out archived channel: ${channel.name} (archived: ${channel.is_archived})`
          )
        }

        return isActive
      })
      .map((channel: SlackChannel) => ({
        id: channel.id,
        name: channel.name,
        isPrivate: channel.is_private,
        isMember: channel.is_member,
        isGeneral: channel.is_general,
        isChannel: channel.is_channel,
        isGroup: channel.is_group,
        isMpim: channel.is_mpim,
        isIm: channel.is_im,
      }))

    logger.info(`Successfully fetched ${channels.length} active Slack channels`, {
      total: data.channels?.length || 0,
      active: channels.length,
      private: channels.filter((c: { isPrivate: boolean }) => c.isPrivate).length,
      public: channels.filter((c: { isPrivate: boolean }) => !c.isPrivate).length,
      tokenType: isBotToken ? 'bot_token' : 'oauth',
    })
    return NextResponse.json({ channels })
  } catch (error) {
    logger.error('Error processing Slack channels request:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve Slack channels', details: (error as Error).message },
      { status: 500 }
    )
  }
}

async function fetchSlackChannels(accessToken: string, includePrivate = true) {
  const allChannels: any[] = []
  let cursor: string | undefined
  let hasMore = true

  while (hasMore) {
    const url = new URL('https://slack.com/api/conversations.list')

    if (includePrivate) {
      url.searchParams.append('types', 'public_channel,private_channel')
    } else {
      url.searchParams.append('types', 'public_channel')
    }

    url.searchParams.append('exclude_archived', 'true')
    url.searchParams.append('limit', '400')

    if (cursor) {
      url.searchParams.append('cursor', cursor)
    }

    const response = await SlackRateLimitHandler.executeWithRetry(
      () =>
        fetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
      }
    )

    if (!response.ok) {
      // Extract rate limit info if available
      const rateLimitInfo = SlackRateLimitHandler.extractRateLimitInfo(response)
      let errorMessage = `Slack API error: ${response.status} ${response.statusText}`

      if (response.status === 429) {
        if (rateLimitInfo.retryAfter) {
          errorMessage += `. Rate limit exceeded. Retry after ${rateLimitInfo.retryAfter} seconds.`
        } else if (rateLimitInfo.reset) {
          errorMessage += `. Rate limit exceeded. Resets at ${rateLimitInfo.reset.toISOString()}.`
        } else {
          errorMessage += '. Rate limit exceeded. Please try again later.'
        }
      }

      throw new Error(errorMessage)
    }

    const data = await response.json()

    if (!data.ok) {
      throw new Error(data.error || 'Failed to fetch channels')
    }

    // Add channels from this page to our collection
    if (data.channels && Array.isArray(data.channels)) {
      allChannels.push(...data.channels)
    }

    // Check if there are more pages
    hasMore = !!data.response_metadata?.next_cursor
    cursor = data.response_metadata?.next_cursor

    // Safety check to prevent infinite loops and limit memory usage
    if (allChannels.length >= 1000) {
      logger.warn('Reached 1,000 channels limit, stopping pagination', {
        channelsLoaded: allChannels.length,
        hasMore: !!data.response_metadata?.next_cursor,
      })
      break
    }
  }

  return {
    ok: true,
    channels: allChannels,
    response_metadata: {
      next_cursor: undefined,
    },
  }
}
