import { NextResponse } from 'next/server'
import { authorizeCredentialUse } from '@/lib/auth/credential-access'
import { createLogger } from '@/lib/logs/console/logger'
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
      logger.info('Attempting to fetch Slack channels (including private channels)', {
        tokenType: isBotToken ? 'bot_token' : 'oauth',
        requestId
      })
      data = await fetchSlackChannels(accessToken, true)
      logger.info('Successfully fetched channels including private channels', {
        totalChannels: data.channels?.length || 0,
        requestId
      })
    } catch (error) {
      const errorMessage = (error as Error).message
      logger.error('Failed to fetch channels with private channels included', {
        error: errorMessage,
        tokenType: isBotToken ? 'bot_token' : 'oauth',
        requestId
      })

      if (isBotToken) {
        logger.warn(
          'Bot token may lack permissions for private channels, falling back to public channels only',
          { error: errorMessage, requestId }
        )
        try {
          data = await fetchSlackChannels(accessToken, false)
          logger.info('Successfully fetched public channels only', {
            totalChannels: data.channels?.length || 0,
            requestId
          })
        } catch (fallbackError) {
          const fallbackErrorMessage = (fallbackError as Error).message
          logger.error('Failed to fetch channels even with public-only fallback', {
            error: fallbackErrorMessage,
            originalError: errorMessage,
            requestId
          })
          return NextResponse.json(
            { 
              error: `Slack API error: ${fallbackErrorMessage}`,
              details: 'Unable to fetch any channels. Please check your Slack app permissions and token validity.',
              requestId
            },
            { status: 400 }
          )
        }
      } else {
        logger.error('OAuth token failed to fetch channels', {
          error: errorMessage,
          requestId
        })
        return NextResponse.json(
          { 
            error: `Slack API error: ${errorMessage}`,
            details: 'Please ensure your Slack app has the required permissions and the token is valid.',
            requestId
          },
          { status: 400 }
        )
      }
    }

    // Filter to channels the bot can access and format the response
    const allChannels = data.channels || []
    const filteredChannels = allChannels.filter((channel: SlackChannel) => {
      // Always exclude archived channels
      if (channel.is_archived) {
        logger.debug(`Filtering out archived channel: ${channel.name}`)
        return false
      }

      // For private channels, bot must be a member
      if (channel.is_private && !channel.is_member) {
        logger.debug(`Filtering out private channel (not a member): ${channel.name}`)
        return false
      }

      // For public channels, include them regardless of membership
      if (!channel.is_private) {
        return true
      }

      // For private channels where we are a member
      return true
    })

    const channels = filteredChannels.map((channel: SlackChannel) => ({
      id: channel.id,
      name: channel.name,
      isPrivate: channel.is_private,
    }))

    // Log detailed filtering information
    const privateChannels = filteredChannels.filter(c => c.is_private).length
    const publicChannels = filteredChannels.filter(c => !c.is_private).length
    const archivedChannels = allChannels.filter(c => c.is_archived).length
    const privateNotMember = allChannels.filter(c => c.is_private && !c.is_member).length

    logger.info(`Channel filtering results:`, {
      total: allChannels.length,
      included: channels.length,
      public: publicChannels,
      private: privateChannels,
      excluded: {
        archived: archivedChannels,
        privateNotMember: privateNotMember,
      }
    })

    logger.info(`Successfully fetched ${channels.length} Slack channels`, {
      total: data.channels?.length || 0,
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
  const allChannels: SlackChannel[] = []
  let cursor: string | undefined
  let hasMore = true
  let pageCount = 0
  const maxPages = 50 // Safety limit to prevent infinite loops

  while (hasMore && pageCount < maxPages) {
    const url = new URL('https://slack.com/api/conversations.list')

    if (includePrivate) {
      url.searchParams.append('types', 'public_channel,private_channel')
    } else {
      url.searchParams.append('types', 'public_channel')
    }

    url.searchParams.append('exclude_archived', 'true')
    url.searchParams.append('limit', '1000') // Use maximum limit for fewer API calls
    
    if (cursor) {
      url.searchParams.append('cursor', cursor)
    }

    logger.debug(`Fetching Slack channels page ${pageCount + 1}${cursor ? ` with cursor: ${cursor}` : ''}`)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    if (!data.ok) {
      throw new Error(data.error || 'Failed to fetch channels')
    }

    // Log detailed response information for debugging
    logger.debug(`Slack API response for page ${pageCount + 1}:`, {
      channelsCount: data.channels?.length || 0,
      hasResponseMetadata: !!data.response_metadata,
      nextCursor: data.response_metadata?.next_cursor || 'none',
      totalChannelsSoFar: allChannels.length
    })

    // Add channels from this page
    if (data.channels && Array.isArray(data.channels)) {
      allChannels.push(...data.channels)
      logger.debug(`Fetched ${data.channels.length} channels from page ${pageCount + 1}`)
    }

    // Check if there are more pages
    // Slack API returns next_cursor as empty string when no more pages
    const nextCursor = data.response_metadata?.next_cursor
    hasMore = nextCursor && nextCursor.trim() !== ''
    cursor = nextCursor
    pageCount++

    logger.debug(`Page ${pageCount} complete. Has more pages: ${hasMore}, Next cursor: ${nextCursor || 'none'}`)

    // Add a small delay to respect rate limits
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  if (pageCount >= maxPages) {
    logger.warn(`Reached maximum page limit (${maxPages}) while fetching Slack channels`)
  }

  logger.info(`Completed pagination: fetched ${allChannels.length} total channels across ${pageCount} pages`, {
    finalPageCount: pageCount,
    totalChannels: allChannels.length,
    hasMore: hasMore,
    finalCursor: cursor
  })

  if (hasMore && pageCount >= maxPages) {
    logger.warn(`Pagination stopped at maximum page limit (${maxPages}) but more channels may be available`)
  }

  return {
    channels: allChannels,
    ok: true,
    response_metadata: {
      next_cursor: null // We've fetched all pages
    }
  }
}
