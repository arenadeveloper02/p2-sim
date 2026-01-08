import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkHybridAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { openDMChannel } from '../utils'

export const dynamic = 'force-dynamic'

const logger = createLogger('SlackReadMessagesAPI')

const SlackReadMessagesSchema = z
  .object({
    accessToken: z.string().min(1, 'Access token is required'),
    channel: z.string().optional().nullable(),
    userId: z.string().optional().nullable(),
    limit: z.coerce
      .number()
      .min(1, 'Limit must be at least 1')
      .max(15, 'Limit cannot exceed 15')
      .optional()
      .nullable(),
    from: z.string().optional().nullable(), // Date string (will be converted to epoch timestamp)
    to: z.string().optional().nullable(), // Date string (will be converted to epoch timestamp)
    oldest: z.string().optional().nullable(), // Unix timestamp (deprecated, use 'from' instead)
    latest: z.string().optional().nullable(), // Unix timestamp (deprecated, use 'to' instead)
  })
  .refine((data) => data.channel || data.userId, {
    message: 'Either channel or userId is required',
  })

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const authResult = await checkHybridAuth(request, { requireWorkflowId: false })

    if (!authResult.success) {
      logger.warn(`[${requestId}] Unauthorized Slack read messages attempt: ${authResult.error}`)
      return NextResponse.json(
        {
          success: false,
          error: authResult.error || 'Authentication required',
        },
        { status: 401 }
      )
    }

    logger.info(
      `[${requestId}] Authenticated Slack read messages request via ${authResult.authType}`,
      {
        userId: authResult.userId,
      }
    )

    const body = await request.json()
    const validatedData = SlackReadMessagesSchema.parse(body)

    let channel = validatedData.channel
    if (!channel && validatedData.userId) {
      logger.info(`[${requestId}] Opening DM channel for user: ${validatedData.userId}`)
      channel = await openDMChannel(
        validatedData.accessToken,
        validatedData.userId,
        requestId,
        logger
      )
    }

    const url = new URL('https://slack.com/api/conversations.history')
    url.searchParams.append('channel', channel!)
    const limit = validatedData.limit ?? 10
    url.searchParams.append('limit', String(limit))

    // Convert date strings to epoch timestamps if provided
    let oldest: string | undefined = validatedData.oldest ?? undefined
    let latest: string | undefined = validatedData.latest ?? undefined

    if (validatedData.from) {
      const fromDate = new Date(validatedData.from)
      if (Number.isNaN(fromDate.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid "from" date format: ${validatedData.from}. Use ISO 8601 format (e.g., "2024-01-01" or "2024-01-01T10:00:00Z")`,
          },
          { status: 400 }
        )
      }
      oldest = String(Math.floor(fromDate.getTime() / 1000))
    }

    if (validatedData.to) {
      const toDate = new Date(validatedData.to)
      if (Number.isNaN(toDate.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid "to" date format: ${validatedData.to}. Use ISO 8601 format (e.g., "2024-01-31" or "2024-01-31T23:59:59Z")`,
          },
          { status: 400 }
        )
      }
      latest = String(Math.floor(toDate.getTime() / 1000))
    }

    if (oldest) {
      url.searchParams.append('oldest', oldest)
    }
    if (latest) {
      url.searchParams.append('latest', latest)
    }

    logger.info(`[${requestId}] Reading Slack messages`, {
      channel,
      limit,
      oldest,
      latest,
    })

    // First, try to get channel info to verify bot membership and channel type
    let channelInfo: any = null
    try {
      const infoUrl = new URL('https://slack.com/api/conversations.info')
      infoUrl.searchParams.append('channel', channel!)
      const infoResponse = await fetch(infoUrl.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validatedData.accessToken}`,
        },
      })
      const infoData = await infoResponse.json()
      if (infoData.ok) {
        channelInfo = infoData.channel
        logger.info(`[${requestId}] Channel info retrieved:`, {
          channelId: channelInfo?.id,
          channelName: channelInfo?.name,
          isPrivate: channelInfo?.is_private,
          isMember: channelInfo?.is_member,
        })
      }
    } catch (infoError) {
      logger.warn(`[${requestId}] Failed to get channel info:`, infoError)
      // Continue with the request even if info fails
    }

    const slackResponse = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validatedData.accessToken}`,
      },
    })

    const data = await slackResponse.json()

    if (!data.ok) {
      logger.error(`[${requestId}] Slack API error:`, {
        error: data.error,
        response: data,
        channel,
        channelInfo: channelInfo
          ? {
              name: channelInfo.name,
              isPrivate: channelInfo.is_private,
              isMember: channelInfo.is_member,
            }
          : null,
        limit,
        oldest,
        latest,
      })

      if (data.error === 'not_in_channel') {
        // Check if we have channel info to provide more specific error
        const isPrivate = channelInfo?.is_private
        const isMember = channelInfo?.is_member

        let errorMessage = 'Bot is not in the channel or lacks permissions to read messages.'
        let suggestion = ''

        if (isPrivate && !isMember) {
          errorMessage =
            'Bot is not a member of this private channel. Please invite the bot by typing: /invite @Sim Studio'
          suggestion = 'Private channels require explicit bot invitation.'
        } else if (isPrivate && isMember) {
          errorMessage =
            'Bot is in the channel but may be missing required scopes. Please reconnect your Slack account with groups:history scope.'
          suggestion =
            'The bot appears to be in the channel but lacks groups:history permission for private channels.'
        } else if (!isPrivate && !isMember) {
          errorMessage =
            'Bot is not in this public channel. Please invite the bot by typing: /invite @Sim Studio'
          suggestion =
            'Even public channels may require bot invitation depending on workspace settings.'
        } else {
          errorMessage =
            'Bot appears to be in the channel but is missing required scopes. Please reconnect your Slack account with channels:history scope.'
          suggestion =
            'If the bot is already in the channel, this is likely a scope issue. Reconnect with channels:history and groups:history scopes.'
        }

        logger.warn(`[${requestId}] not_in_channel error details:`, {
          channel,
          channelName: channelInfo?.name,
          isPrivate,
          isMember,
          errorMessage,
        })

        return NextResponse.json(
          {
            success: false,
            error: errorMessage,
            details: {
              error: data.error,
              channel,
              channelName: channelInfo?.name,
              isPrivate,
              isMember,
              suggestion,
            },
          },
          { status: 400 }
        )
      }
      if (data.error === 'channel_not_found') {
        return NextResponse.json(
          {
            success: false,
            error: 'Channel not found. Please check the channel ID and try again.',
          },
          { status: 400 }
        )
      }
      if (data.error === 'missing_scope') {
        return NextResponse.json(
          {
            success: false,
            error:
              'Missing required permissions. Please reconnect your Slack account with the necessary scopes (channels:history, groups:history, im:history).',
          },
          { status: 400 }
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: data.error || 'Failed to fetch messages',
        },
        { status: 400 }
      )
    }

    const messages = (data.messages || []).map((message: any) => ({
      type: message.type || 'message',
      ts: message.ts,
      text: message.text || '',
      user: message.user,
      bot_id: message.bot_id,
      username: message.username,
      channel: message.channel,
      team: message.team,
      thread_ts: message.thread_ts,
      parent_user_id: message.parent_user_id,
      reply_count: message.reply_count,
      reply_users_count: message.reply_users_count,
      latest_reply: message.latest_reply,
      subscribed: message.subscribed,
      last_read: message.last_read,
      unread_count: message.unread_count,
      subtype: message.subtype,
      reactions: message.reactions?.map((reaction: any) => ({
        name: reaction.name,
        count: reaction.count,
        users: reaction.users || [],
      })),
      is_starred: message.is_starred,
      pinned_to: message.pinned_to,
      files: message.files?.map((file: any) => ({
        id: file.id,
        name: file.name,
        mimetype: file.mimetype,
        size: file.size,
        url_private: file.url_private,
        permalink: file.permalink,
        mode: file.mode,
      })),
      attachments: message.attachments,
      blocks: message.blocks,
      edited: message.edited
        ? {
            user: message.edited.user,
            ts: message.edited.ts,
          }
        : undefined,
      permalink: message.permalink,
    }))

    logger.info(`[${requestId}] Successfully read ${messages.length} messages`)

    return NextResponse.json({
      success: true,
      output: {
        messages,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(`[${requestId}] Invalid request data`, { errors: error.errors })
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.errors,
        },
        { status: 400 }
      )
    }

    logger.error(`[${requestId}] Error reading Slack messages:`, error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
