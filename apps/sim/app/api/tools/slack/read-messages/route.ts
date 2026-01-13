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
      .max(200, 'Limit cannot exceed 200')
      .optional()
      .nullable(),
    oldest: z.string().optional().nullable(),
    latest: z.string().optional().nullable(),
    fromDate: z.string().optional().nullable(),
    toDate: z.string().optional().nullable(),
    cursor: z.string().optional().nullable(),
    autoPaginate: z.boolean().optional().default(false),
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
    logger.info(`[${requestId}] Raw request body: ${JSON.stringify(body)}`)
    logger.info(`[${requestId}] Raw cursor value: "${body.cursor}", type: ${typeof body.cursor}, isEmpty: ${body.cursor === ''}, isNull: ${body.cursor === null}, isUndefined: ${body.cursor === undefined}`)
    const validatedData = SlackReadMessagesSchema.parse(body)
    logger.info(
      `[${requestId}] Validated data: ${JSON.stringify({ ...validatedData, accessToken: '[REDACTED]' })}`
    )

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

    // Convert dates to timestamps if provided
    let oldestTimestamp = validatedData.oldest
    let latestTimestamp = validatedData.latest

    if (oldestTimestamp && !validatedData.fromDate) {
      logger.info(`[${requestId}] Received oldest timestamp: ${oldestTimestamp}`)
    }
    if (latestTimestamp && !validatedData.toDate) {
      logger.info(`[${requestId}] Received latest timestamp: ${latestTimestamp}`)
    }

    if (validatedData.fromDate) {
      try {
        const fromDate = new Date(validatedData.fromDate)
        if (Number.isNaN(fromDate.getTime())) {
          throw new Error('Invalid from date format')
        }
        oldestTimestamp = Math.floor(fromDate.getTime() / 1000).toString()
        logger.info(
          `[${requestId}] Converted fromDate "${validatedData.fromDate}" -> timestamp "${oldestTimestamp}" (${fromDate.toISOString()})`
        )
      } catch (error) {
        throw new Error('Invalid from date format. Use YYYY-MM-DD format.')
      }
    }

    if (validatedData.toDate) {
      try {
        const toDate = new Date(validatedData.toDate)
        if (Number.isNaN(toDate.getTime())) {
          throw new Error('Invalid to date format')
        }
        latestTimestamp = Math.floor(toDate.getTime() / 1000).toString()
        logger.info(
          `[${requestId}] Converted toDate "${validatedData.toDate}" -> timestamp "${latestTimestamp}" (${toDate.toISOString()})`
        )
      } catch (error) {
        throw new Error('Invalid to date format. Use YYYY-MM-DD format.')
      }
    }

    if (oldestTimestamp) {
      url.searchParams.append('oldest', oldestTimestamp)
    }
    if (latestTimestamp) {
      url.searchParams.append('latest', latestTimestamp)
    }
    logger.info(`[${requestId}] About to check cursor: "${validatedData.cursor}", truthy: ${!!validatedData.cursor}`)
    if (validatedData.cursor) {
      url.searchParams.append('cursor', validatedData.cursor)
      logger.info(`[${requestId}] Added cursor to URL: ${validatedData.cursor}`)
    } else {
      logger.info(`[${requestId}] No cursor added to URL`)
    }

    const autoPaginate = validatedData.autoPaginate || false
    const maxTotalMessages = 1000 // Safety limit: maximum 1000 messages

    logger.info(`[${requestId}] Reading Slack messages`, {
      channel,
      limit,
      autoPaginate,
      autoPaginateType: typeof autoPaginate,
      validatedAutoPaginate: validatedData.autoPaginate,
      hasCursor: !!validatedData.cursor,
      cursor: `${validatedData.cursor?.substring(0, 20)}...`,
    })

    const allMessages: any[] = []
    let currentCursor = validatedData.cursor
    let pagesFetched = 0
    let hasMore = true
    let finalNextCursor: string | null = null

    // If auto-paginate is enabled, fetch all pages starting from cursor (or beginning)
    if (autoPaginate) {
      logger.info(`[${requestId}] 🚀 AUTO-PAGINATION ENABLED - Starting multi-page fetch`)
      logger.info(
        `[${requestId}] Initial state: cursor=${currentCursor}, hasMore=${hasMore}, pagesFetched=${pagesFetched}`
      )

      while (hasMore && allMessages.length < maxTotalMessages) {
        pagesFetched++ // Increment at start of loop

        const pageUrl = new URL('https://slack.com/api/conversations.history')
        pageUrl.searchParams.append('channel', channel!)

        // Use the same date filters for all pages
        if (oldestTimestamp) {
          pageUrl.searchParams.append('oldest', oldestTimestamp)
        }
        if (latestTimestamp) {
          pageUrl.searchParams.append('latest', latestTimestamp)
        }

        // Use per-page limit (smaller for pagination)
        const perPageLimit = Math.min(limit || 50, 100) // Max 100 per page for efficiency
        pageUrl.searchParams.append('limit', String(perPageLimit))

        if (currentCursor) {
          pageUrl.searchParams.append('cursor', currentCursor)
        }

        logger.info(
          `[${requestId}] Fetching page ${pagesFetched} with cursor: ${currentCursor || 'none'}`
        )
        logger.info(`[${requestId}] Page URL: ${pageUrl.toString()}`)

        const slackResponse = await fetch(pageUrl.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${validatedData.accessToken}`,
          },
        })

        const data = await slackResponse.json()

        if (!data.ok) {
          logger.error(`[${requestId}] Slack API error on page ${pagesFetched}:`, data)
          break // Stop pagination on error
        }

        logger.info(
          `[${requestId}] Page ${pagesFetched} response: has_more=${data.has_more}, messages=${(data.messages || []).length}, next_cursor=${data.response_metadata?.next_cursor?.substring(0, 20)}...`
        )

        const pageMessages = (data.messages || []).map((message: any) => ({
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

        logger.info(`[${requestId}] Page ${pagesFetched}: got ${pageMessages.length} messages`)
        allMessages.push(...pageMessages)

        // Check if we've reached the message limit
        if (allMessages.length >= maxTotalMessages) {
          logger.warn(`[${requestId}] Reached maximum message limit (${maxTotalMessages})`)
          hasMore = false
          break
        }

        // Update cursor for next page
        currentCursor = data.response_metadata?.next_cursor
        hasMore = data.has_more && !!currentCursor
        finalNextCursor = currentCursor || null

        logger.info(
          `[${requestId}] Page ${pagesFetched}: hasMore=${hasMore}, nextCursor=${currentCursor?.substring(0, 20)}..., willContinue=${hasMore && allMessages.length < maxTotalMessages}`
        )

        // Add small delay between requests to avoid rate limits
        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        } else {
          logger.info(
            `[${requestId}] Stopping pagination: hasMore=${hasMore}, pagesFetched=${pagesFetched}, messages=${allMessages.length}/${maxTotalMessages}`
          )
        }
      }

      logger.info(
        `[${requestId}] ✅ Auto-pagination completed: ${pagesFetched} pages, ${allMessages.length} total messages`
      )

      return NextResponse.json({
        success: true,
        output: {
          messages: allMessages,
          nextCursor: finalNextCursor, // Always include for block chaining
          hasMore: !!finalNextCursor, // Whether there are more messages available
          totalPages: pagesFetched,
          totalMessages: allMessages.length,
          paginationInfo: {
            autoPaginated: true,
            mode: 'auto-pagination',
            maxMessagesReached: allMessages.length >= maxTotalMessages,
          },
        },
      })
    }

    // Original single-page logic (auto-pagination disabled)
    logger.info(
      `[${requestId}] SINGLE-PAGE FETCH - Auto-pagination disabled, cursor: ${validatedData.cursor}`
    )
    logger.info(`[${requestId}] Request URL: ${url.toString()}`)
    const slackResponse = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validatedData.accessToken}`,
      },
    })

    const data = await slackResponse.json()

    logger.info(
      `[${requestId}] Single-page response: has_more=${data.has_more}, messages=${(data.messages || []).length}, next_cursor=${data.response_metadata?.next_cursor?.substring(0, 20)}...`
    )

    if (!data.ok) {
      logger.error(`[${requestId}] Slack API error:`, data)

      if (data.error === 'not_in_channel') {
        return NextResponse.json(
          {
            success: false,
            error:
              'Bot is not in the channel. Please invite the Sim bot to your Slack channel by typing: /invite @Sim Studio',
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
        nextCursor: data.response_metadata?.next_cursor || null,
        hasMore: data.has_more || false,
        paginationInfo: {
          mode: 'single-page',
          autoPaginated: false,
        },
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
