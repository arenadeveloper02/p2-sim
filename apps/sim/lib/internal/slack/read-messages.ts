import { createLogger } from '@sim/logger'
import { sleep } from '@sim/utils/helpers'
import type { SlackReadMessagesBody } from '@/lib/api/contracts/tools/communication/slack'
import {
  openSlackDm,
  requestSlackApi,
  type SlackJsonObject,
  slackArray,
  slackObject,
  slackOk,
  slackString,
} from '@/lib/internal/slack/client'
import { SlackOperationError } from '@/lib/internal/slack/errors'

const logger = createLogger('SlackReadMessages')

const MAX_TOTAL_MESSAGES = 1000
const PER_PAGE_LIMIT = 100
const USER_INFO_BATCH_SIZE = 10

type SlackReaderMessage = Record<string, unknown>

function failure(status: number, error: string): never {
  throw new SlackOperationError(status, { success: false, error })
}

function providerError(data: SlackJsonObject, status: number, fallback: string): never {
  return failure(status, slackString(data, 'error') || fallback)
}

function historyProviderError(data: SlackJsonObject, status: number): never {
  const error = slackString(data, 'error')
  if (error === 'not_in_channel') {
    failure(
      400,
      'Bot is not in the channel. Please invite the Arena bot to your Slack channel by typing: /invite @bot'
    )
  }
  if (error === 'channel_not_found') {
    failure(400, 'Channel not found. Please check the channel ID and try again.')
  }
  if (error === 'missing_scope') {
    failure(
      400,
      'Missing required permissions. Reconnect your Slack account to grant channel history access (channels:history, groups:history). Reading direct message history is not supported with the Sim bot.'
    )
  }
  providerError(data, status, 'Failed to fetch messages')
}

function record(value: unknown): SlackJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as SlackJsonObject)
    : {}
}

function extractMentionedUserIds(text: string): string[] {
  const mentionPattern = /<@([A-Z0-9]+)(?:\|[^>]+)?>/g
  const userIds: string[] = []
  let match = mentionPattern.exec(text)
  while (match) {
    userIds.push(match[1])
    match = mentionPattern.exec(text)
  }
  return userIds
}

function replaceMentionsWithUsernames(text: string, userNames: Record<string, string>): string {
  return text.replace(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g, (original, userId: string) => {
    const username = userNames[userId]
    return username ? `@${username}` : original
  })
}

function normalizeSlackTimestamp(
  value: string | null | undefined,
  requestId: string
): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined

  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric)) return trimmed

  if (numeric > 1_000_000_000_000) {
    const normalized = (numeric / 1000).toString()
    logger.info(`[${requestId}] Normalized millisecond timestamp "${trimmed}" -> "${normalized}"`)
    return normalized
  }

  return trimmed
}

function collectUserIds(messages: SlackJsonObject[]): string[] {
  const userIds: string[] = []
  for (const message of messages) {
    const user = slackString(message, 'user')
    if (user) userIds.push(user)
    const editedUser = slackString(slackObject(message, 'edited') ?? {}, 'user')
    if (editedUser) userIds.push(editedUser)
    const reactions = slackArray(message, 'reactions') ?? []
    for (const reaction of reactions) {
      const users = slackArray(record(reaction), 'users') ?? []
      for (const id of users) {
        if (typeof id === 'string') userIds.push(id)
      }
    }
    const text = slackString(message, 'text')
    if (text) userIds.push(...extractMentionedUserIds(text))
  }
  return userIds
}

async function fetchUserInfo(
  userIds: string[],
  accessToken: string,
  requestId: string,
  signal?: AbortSignal
): Promise<Record<string, string>> {
  const userNames: Record<string, string> = {}
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueUserIds.length === 0) return userNames

  logger.info(`[${requestId}] Fetching user info for ${uniqueUserIds.length} unique users`)

  for (let i = 0; i < uniqueUserIds.length; i += USER_INFO_BATCH_SIZE) {
    const batch = uniqueUserIds.slice(i, i + USER_INFO_BATCH_SIZE)
    await Promise.allSettled(
      batch.map(async (userId, index) => {
        if (index > 0) await sleep(100)
        const { data } = await requestSlackApi({
          accessToken,
          method: 'users.info',
          httpMethod: 'GET',
          query: { user: userId },
          signal,
        })
        if (slackOk(data)) {
          userNames[userId] = slackString(slackObject(data, 'user') ?? {}, 'name') || ''
        } else {
          logger.warn(
            `[${requestId}] Failed to fetch user info for ${userId}:`,
            slackString(data, 'error')
          )
          userNames[userId] = ''
        }
      })
    )
    if (i + USER_INFO_BATCH_SIZE < uniqueUserIds.length) await sleep(200)
  }

  return userNames
}

function mapReaderMessage(value: unknown, userNames: Record<string, string>): SlackReaderMessage {
  const message = record(value)
  const edited = slackObject(message, 'edited')
  const user = slackString(message, 'user')
  const text = slackString(message, 'text') || ''
  const reactions = slackArray(message, 'reactions')
  const files = slackArray(message, 'files')

  return {
    type: message.type || 'message',
    ts: message.ts,
    text: replaceMentionsWithUsernames(text, userNames),
    user,
    user_name: user ? userNames[user] || '' : '',
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
    reactions: reactions?.map((reactionValue) => {
      const reaction = record(reactionValue)
      const users = Array.isArray(reaction.users) ? reaction.users : []
      return {
        name: reaction.name,
        count: reaction.count,
        users,
        user_names: users.map((id) => (typeof id === 'string' ? userNames[id] || '' : '')),
      }
    }),
    is_starred: message.is_starred,
    pinned_to: message.pinned_to,
    files: files?.map((fileValue) => {
      const file = record(fileValue)
      return {
        id: file.id,
        name: file.name,
        mimetype: file.mimetype,
        size: file.size,
        url_private: file.url_private,
        permalink: file.permalink,
        mode: file.mode,
      }
    }),
    attachments: message.attachments,
    blocks: message.blocks,
    edited: edited
      ? {
          user: edited.user,
          user_name: slackString(edited, 'user')
            ? userNames[slackString(edited, 'user') as string] || ''
            : '',
          ts: edited.ts,
        }
      : undefined,
    permalink: message.permalink,
  }
}

async function fetchThreadReplies(
  channel: string,
  threadTs: string,
  accessToken: string,
  maxReplies: number,
  requestId: string,
  signal?: AbortSignal
): Promise<SlackReaderMessage[]> {
  const { data } = await requestSlackApi({
    accessToken,
    method: 'conversations.replies',
    httpMethod: 'GET',
    query: {
      channel,
      ts: threadTs,
      limit: Math.min(maxReplies + 1, 200),
    },
    signal,
  })
  if (!slackOk(data)) {
    logger.warn(
      `[${requestId}] Failed to fetch thread replies for ts ${threadTs}:`,
      slackString(data, 'error')
    )
    return []
  }

  const rawReplies = (slackArray(data, 'messages') ?? []).slice(1, maxReplies + 1).map(record)
  const replyUserNames = await fetchUserInfo(
    collectUserIds(rawReplies),
    accessToken,
    requestId,
    signal
  )
  return rawReplies.map((message) => mapReaderMessage(message, replyUserNames))
}

async function attachThreadReplies(
  messages: SlackReaderMessage[],
  channel: string,
  accessToken: string,
  maxThreads: number,
  maxRepliesPerThread: number,
  requestId: string,
  signal?: AbortSignal
) {
  const threadTsSet = new Set<string>()
  for (const message of messages) {
    const replyCount = typeof message.reply_count === 'number' ? message.reply_count : 0
    const ts = typeof message.ts === 'string' ? message.ts : undefined
    const threadTs = typeof message.thread_ts === 'string' ? message.thread_ts : undefined
    if (replyCount > 0 && ts) {
      threadTsSet.add(ts)
    } else if (threadTs) {
      threadTsSet.add(threadTs)
    }
  }

  const uniqueThreadTs = [...threadTsSet].slice(0, maxThreads)
  if (uniqueThreadTs.length === 0) return

  const threadResults = await Promise.allSettled(
    uniqueThreadTs.map(async (threadTs, index) => {
      if (index > 0) await sleep(100)
      return {
        threadTs,
        replies: await fetchThreadReplies(
          channel,
          threadTs,
          accessToken,
          maxRepliesPerThread,
          requestId,
          signal
        ),
      }
    })
  )

  uniqueThreadTs.forEach((threadTs, index) => {
    const result = threadResults[index]
    const parentMessage = messages.find(
      (message) => message.ts === threadTs || message.thread_ts === threadTs
    )
    if (!parentMessage) return
    if (result.status === 'fulfilled') {
      parentMessage.replies = result.value.replies
    } else {
      logger.warn(
        `[${requestId}] Failed to fetch replies for thread ts: ${threadTs}`,
        result.reason
      )
      parentMessage.replies = []
    }
  })
}

function resolveDateRange(
  input: SlackReadMessagesBody,
  requestId: string
): { oldest?: string; latest?: string } {
  let oldest = normalizeSlackTimestamp(input.oldest, requestId)
  let latest = normalizeSlackTimestamp(input.latest, requestId)

  if (input.fromDate) {
    const fromDate = new Date(`${input.fromDate}T00:00:00.000Z`)
    if (Number.isNaN(fromDate.getTime())) {
      failure(400, 'Invalid from date format. Use YYYY-MM-DD format.')
    }
    oldest = Math.floor(fromDate.getTime() / 1000).toString()
  }

  if (input.toDate) {
    const toDate = new Date(`${input.toDate}T23:59:59.999Z`)
    if (Number.isNaN(toDate.getTime())) {
      failure(400, 'Invalid to date format. Use YYYY-MM-DD format.')
    }
    latest = Math.floor(toDate.getTime() / 1000).toString()
  }

  return { oldest, latest }
}

function nextCursorFrom(data: SlackJsonObject): string | null {
  const cursor = slackString(slackObject(data, 'response_metadata') ?? {}, 'next_cursor')?.trim()
  return cursor || null
}

/**
 * Reads Slack channel or DM history with Arena pagination, mention resolution,
 * and optional thread replies.
 */
export async function executeSlackReadMessages(input: SlackReadMessagesBody, signal?: AbortSignal) {
  const requestId = 'slack-read-messages'
  let channel = input.channel ?? undefined
  if (!channel && input.userId) channel = await openSlackDm(input.accessToken, input.userId, signal)
  if (!channel) failure(400, 'Either channel or userId is required')

  const { oldest, latest } = resolveDateRange(input, requestId)
  const autoPaginate = input.autoPaginate !== false
  const includeThreads = input.includeThreads !== false
  const requestedTotalLimit = typeof input.limit === 'number' ? input.limit : 10
  const effectiveTotalLimit = Math.min(requestedTotalLimit, MAX_TOTAL_MESSAGES)
  const maxThreads = input.maxThreads ?? 10
  const maxRepliesPerThread = input.maxRepliesPerThread ?? 100

  const rawMessages: SlackJsonObject[] = []
  let currentCursor = input.cursor ?? undefined
  let pagesFetched = 0
  let finalNextCursor: string | null = null

  const fetchHistoryPage = async (limit: number, cursor?: string | null) => {
    const { data, status } = await requestSlackApi({
      accessToken: input.accessToken,
      method: 'conversations.history',
      httpMethod: 'GET',
      query: {
        channel,
        limit,
        oldest,
        latest,
        cursor: cursor || undefined,
      },
      signal,
    })
    if (!slackOk(data)) historyProviderError(data, status)
    return data
  }

  if (autoPaginate) {
    let hasMore = true
    while (hasMore && rawMessages.length < effectiveTotalLimit) {
      pagesFetched++
      const remaining = effectiveTotalLimit - rawMessages.length
      if (remaining <= 0) break
      const data = await fetchHistoryPage(Math.min(remaining, PER_PAGE_LIMIT), currentCursor)
      const pageMessages = (slackArray(data, 'messages') ?? []).map(record)
      rawMessages.push(...pageMessages)
      currentCursor = nextCursorFrom(data) ?? undefined
      finalNextCursor = currentCursor ?? null
      hasMore = data.has_more === true && Boolean(currentCursor)
      if (hasMore && rawMessages.length < effectiveTotalLimit) {
        await sleep(100)
      }
    }
  } else {
    pagesFetched = 1
    const data = await fetchHistoryPage(effectiveTotalLimit, currentCursor)
    rawMessages.push(...(slackArray(data, 'messages') ?? []).map(record))
    finalNextCursor = nextCursorFrom(data)
  }

  const userNames = await fetchUserInfo(
    collectUserIds(rawMessages),
    input.accessToken,
    requestId,
    signal
  )
  const messages = rawMessages
    .slice(0, effectiveTotalLimit)
    .map((message) => mapReaderMessage(message, userNames))

  if (includeThreads && messages.length > 0) {
    await attachThreadReplies(
      messages,
      channel,
      input.accessToken,
      maxThreads,
      maxRepliesPerThread,
      requestId,
      signal
    )
  }

  return {
    success: true as const,
    output: {
      messages,
      nextCursor: finalNextCursor,
      hasMore: Boolean(finalNextCursor),
      totalPages: pagesFetched,
      totalMessages: messages.length,
      paginationInfo: {
        autoPaginated: autoPaginate,
        mode: autoPaginate ? 'auto-pagination' : 'single-page',
        maxMessagesReached: messages.length >= MAX_TOTAL_MESSAGES,
        requestedLimit: requestedTotalLimit,
        limitReached: messages.length >= effectiveTotalLimit,
      },
    },
  }
}
