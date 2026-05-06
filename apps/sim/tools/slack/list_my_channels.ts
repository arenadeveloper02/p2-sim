import type { SlackListMyChannelsParams, SlackListMyChannelsResponse } from '@/tools/slack/types'
import { CHANNEL_OUTPUT_PROPERTIES } from '@/tools/slack/types'
import type { ToolConfig } from '@/tools/types'

/**
 * Partial Slack conversation object as returned by `users.conversations`.
 */
interface SlackApiConversation {
  id?: string
  name?: string
  is_im?: boolean
  is_mpim?: boolean
  is_private?: boolean
  is_archived?: boolean
  is_member?: boolean
  num_members?: number
  topic?: { value?: string }
  purpose?: { value?: string }
  created?: number
  creator?: string
  user?: string
}

interface SlackUsersConversationsResponse {
  ok: boolean
  error?: string
  needed?: string
  channels?: SlackApiConversation[]
  response_metadata?: { next_cursor?: string }
}

/**
 * Slack `users.conversations` — conversations the token owner belongs to.
 * Can include channels, 1:1 DMs (`im`), and group DMs (`mpim`) depending on params.
 *
 * @see https://api.slack.com/methods/users.conversations
 */
export const slackListMyChannelsTool: ToolConfig<
  SlackListMyChannelsParams,
  SlackListMyChannelsResponse
> = {
  id: 'slack_list_my_channels',
  name: 'Slack List My Channels',
  description:
    "List the authenticated user's own Slack conversations (channels, 1:1 DMs, group DMs) via users.conversations. Use this first if you want DMs/group DMs or if you need conversation IDs; it returns only what you're in (smaller than workspace-wide list).",
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'slack',
  },

  params: {
    authMethod: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Authentication method: oauth or bot_token',
    },
    botToken: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Bot token for Custom Bot',
    },
    accessToken: {
      type: 'string',
      required: false,
      visibility: 'hidden',
      description: 'OAuth access token or bot token for Slack API',
    },
    includePublic: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Include joined public channels in `types` (maps to `public_channel`; default: true)',
    },
    includePrivate: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Include private channels you belong to in `types` (maps to `private_channel`; default: true)',
    },
    includeDMs: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Include 1:1 direct messages in `types` (Slack type `im`; requires im:read scope; default: false)',
    },
    includeGroupDMs: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Include group / multi-person DMs in `types` (Slack type `mpim`; requires mpim:read scope; default: false)',
    },
    excludeArchived: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Exclude archived channels (default: true)',
    },
    limit: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Maximum number of channels to return (default: 200, max: 200)',
    },
    cursor: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Pagination cursor from a previous response (`output.cursor`) to fetch the next page',
    },
    autoPaginate: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Fetch all pages automatically (default: false)',
    },
  },

  request: {
    url: (params: SlackListMyChannelsParams) => {
      const url = new URL('https://slack.com/api/users.conversations')

      const isTrue = (v: unknown): boolean => v === true || v === 'true'
      const isFalse = (v: unknown): boolean => v === false || v === 'false'

      const types: string[] = []
      if (!isFalse(params.includePublic)) types.push('public_channel')
      if (!isFalse(params.includePrivate)) types.push('private_channel')
      if (isTrue(params.includeDMs)) types.push('im')
      if (isTrue(params.includeGroupDMs)) types.push('mpim')
      if (types.length === 0) types.push('public_channel')
      url.searchParams.append('types', types.join(','))

      const excludeArchived = !isFalse(params.excludeArchived)
      url.searchParams.append('exclude_archived', String(excludeArchived))

      const limit = params.limit ? Math.min(Number(params.limit), 200) : 200
      url.searchParams.append('limit', String(limit))

      if (typeof params.cursor === 'string') {
        const c = params.cursor.trim()
        if (c) {
          url.searchParams.append('cursor', c)
        }
      }

      return url.toString()
    },
    method: 'GET',
    headers: (params: SlackListMyChannelsParams) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken || params.botToken}`,
    }),
  },

  transformResponse: async (response: Response, params?: SlackListMyChannelsParams) => {
    const isTrue = (v: unknown): boolean => v === true || v === 'true'

    const data = (await response.json()) as SlackUsersConversationsResponse

    if (!data.ok) {
      if (data.error === 'missing_scope') {
        const needed = data.needed ? ` Missing scope: ${data.needed}.` : ''
        throw new Error(
          `Missing required permissions. Please reconnect your Slack account with the necessary scopes (channels:read for public channels, groups:read for private channels, im:read for 1:1 DMs, mpim:read for group DMs).${needed}`
        )
      }
      if (data.error === 'invalid_auth') {
        throw new Error('Invalid authentication. Please check your Slack credentials.')
      }
      throw new Error(data.error || 'Failed to list my channels from Slack')
    }

    const accessToken = params?.accessToken || params?.botToken
    const shouldAutoPaginate = isTrue(params?.autoPaginate)

    const allRaw: SlackApiConversation[] = [...(data.channels ?? [])]

    if (shouldAutoPaginate) {
      if (!accessToken) {
        throw new Error('Missing access token for auto pagination')
      }

      let nextCursor = data.response_metadata?.next_cursor
      while (typeof nextCursor === 'string' && nextCursor.trim().length > 0) {
        const url = new URL('https://slack.com/api/users.conversations')

        const types: string[] = []
        const isFalse = (v: unknown): boolean => v === false || v === 'false'
        if (!isFalse(params?.includePublic)) types.push('public_channel')
        if (!isFalse(params?.includePrivate)) types.push('private_channel')
        if (isTrue(params?.includeDMs)) types.push('im')
        if (isTrue(params?.includeGroupDMs)) types.push('mpim')
        if (types.length === 0) types.push('public_channel')
        url.searchParams.append('types', types.join(','))

        const excludeArchived = !isFalse(params?.excludeArchived)
        url.searchParams.append('exclude_archived', String(excludeArchived))

        const limit = params?.limit ? Math.min(Number(params.limit), 200) : 200
        url.searchParams.append('limit', String(limit))

        url.searchParams.append('cursor', nextCursor.trim())

        const pageResponse = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        })

        const pageData = (await pageResponse.json()) as SlackUsersConversationsResponse
        if (!pageData.ok) {
          throw new Error(pageData.error || 'Failed to paginate Slack conversations')
        }

        allRaw.push(...(pageData.channels ?? []))
        nextCursor = pageData.response_metadata?.next_cursor
      }
    }

    const channels = allRaw.map((channel) => {
      const isIm = Boolean(channel.is_im)
      const isMpim = Boolean(channel.is_mpim)
      return {
        id: channel.id ?? '',
        name: channel.name || (isIm ? `dm:${channel.user ?? ''}` : isMpim ? 'group_dm' : ''),
        is_private: channel.is_private || isIm || isMpim,
        is_archived: channel.is_archived || false,
        is_member: channel.is_member ?? true,
        num_members: channel.num_members,
        topic: channel.topic?.value || '',
        purpose: channel.purpose?.value || '',
        created: channel.created,
        creator: channel.creator,
        is_im: isIm,
        is_mpim: isMpim,
        user: channel.user,
      }
    })

    const ids = channels.map((channel) => channel.id)
    const names = channels.map((channel) => channel.name)

    const cursor = shouldAutoPaginate
      ? null
      : typeof data.response_metadata?.next_cursor === 'string' &&
          data.response_metadata?.next_cursor.length > 0
        ? data.response_metadata.next_cursor
        : null

    return {
      success: true,
      output: {
        channels,
        ids,
        names,
        count: channels.length,
        cursor,
      },
    }
  },

  outputs: {
    channels: {
      type: 'array',
      description: 'Array of channel objects the token owner belongs to',
      items: {
        type: 'object',
        properties: CHANNEL_OUTPUT_PROPERTIES,
      },
    },
    ids: {
      type: 'array',
      description: 'Array of channel IDs for easy access',
      items: { type: 'string', description: 'Channel ID' },
    },
    names: {
      type: 'array',
      description: 'Array of channel names for easy access',
      items: { type: 'string', description: 'Channel name' },
    },
    count: {
      type: 'number',
      description: 'Total number of channels returned',
    },
    cursor: {
      type: 'string',
      optional: true,
      description:
        'Cursor for the next page (`response_metadata.next_cursor`); absent or null when there are no more results',
    },
  },
}
