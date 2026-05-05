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

/**
 * Slack `users.conversations` with public + private channels only — conversations
 * the token owner belongs to. Does not include DMs / group DMs.
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
    'List channels the authenticated user is a member of via Slack users.conversations. Control `types` (public / private), exclude_archived, limit, and cursor — no DMs. For every channel in the workspace the token can see, use List Channels instead.',
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
  },

  request: {
    url: (params: SlackListMyChannelsParams) => {
      const url = new URL('https://slack.com/api/users.conversations')

      const isFalse = (v: unknown): boolean => v === false || v === 'false'

      const types: string[] = []
      if (!isFalse(params.includePublic)) types.push('public_channel')
      if (!isFalse(params.includePrivate)) types.push('private_channel')
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

  transformResponse: async (response: Response) => {
    const data = await response.json()

    if (!data.ok) {
      if (data.error === 'missing_scope') {
        const needed = data.needed ? ` Missing scope: ${data.needed}.` : ''
        throw new Error(
          `Missing required permissions. Please reconnect your Slack account with the necessary scopes (channels:read for public channels, groups:read for private channels).${needed}`
        )
      }
      if (data.error === 'invalid_auth') {
        throw new Error('Invalid authentication. Please check your Slack credentials.')
      }
      throw new Error(data.error || 'Failed to list my channels from Slack')
    }

    const rawList = (data.channels ?? []) as SlackApiConversation[]
    const channels = rawList.map((channel) => {
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

    const nextCursorRaw = data.response_metadata?.next_cursor
    const cursor =
      typeof nextCursorRaw === 'string' && nextCursorRaw.length > 0 ? nextCursorRaw : null

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
