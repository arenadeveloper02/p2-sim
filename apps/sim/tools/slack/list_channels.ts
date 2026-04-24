import type { SlackListChannelsParams, SlackListChannelsResponse } from '@/tools/slack/types'
import { CHANNEL_OUTPUT_PROPERTIES } from '@/tools/slack/types'
import type { ToolConfig } from '@/tools/types'

export const slackListChannelsTool: ToolConfig<SlackListChannelsParams, SlackListChannelsResponse> =
  {
    id: 'slack_list_channels',
    name: 'Slack List Channels',
    description:
      'List all channels in a Slack workspace. Returns public and private channels the bot has access to.',
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
      includePrivate: {
        type: 'boolean',
        required: false,
        visibility: 'user-or-llm',
        description: 'Include private channels the bot is a member of (default: true)',
      },
      includeDMs: {
        type: 'boolean',
        required: false,
        visibility: 'user-or-llm',
        description:
          'Include 1:1 direct message conversations (requires im:read scope; default: false)',
      },
      includeGroupDMs: {
        type: 'boolean',
        required: false,
        visibility: 'user-or-llm',
        description:
          'Include multi-person direct messages / group DMs (requires mpim:read scope; default: false)',
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
        description: 'Maximum number of channels to return (default: 100, max: 200)',
      },
    },

    request: {
      url: (params: SlackListChannelsParams) => {
        const url = new URL('https://slack.com/api/conversations.list')

        // Accept both booleans and their string representations, because the
        // block wiring may forward raw form values ('true' / 'false') through
        // the tool runner depending on the caller path.
        const isTrue = (v: unknown): boolean => v === true || v === 'true'
        const isFalse = (v: unknown): boolean => v === false || v === 'false'

        // Build conversation types list. public_channel is always on;
        // private_channel defaults on (opt-out); im/mpim are opt-in because
        // they require extra scopes (im:read / mpim:read).
        const types: string[] = ['public_channel']
        if (!isFalse(params.includePrivate)) types.push('private_channel')
        if (isTrue(params.includeDMs)) types.push('im')
        if (isTrue(params.includeGroupDMs)) types.push('mpim')
        url.searchParams.append('types', types.join(','))

        // Exclude archived by default (opt-out).
        const excludeArchived = !isFalse(params.excludeArchived)
        url.searchParams.append('exclude_archived', String(excludeArchived))

        // Set limit (default 100, max 200).
        const limit = params.limit ? Math.min(Number(params.limit), 200) : 100
        url.searchParams.append('limit', String(limit))

        return url.toString()
      },
      method: 'GET',
      headers: (params: SlackListChannelsParams) => ({
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
            `Missing required permissions. Please reconnect your Slack account with the necessary scopes (channels:read for public channels, groups:read for private channels, im:read for DMs, mpim:read for group DMs).${needed}`
          )
        }
        if (data.error === 'invalid_auth') {
          throw new Error('Invalid authentication. Please check your Slack credentials.')
        }
        throw new Error(data.error || 'Failed to list channels from Slack')
      }

      const channels = (data.channels || []).map((channel: any) => {
        const isIm = Boolean(channel.is_im)
        const isMpim = Boolean(channel.is_mpim)
        return {
          id: channel.id,
          // DMs have no `name`; fall back to a stable label so downstream
          // consumers that expect a string don't break.
          name: channel.name || (isIm ? `dm:${channel.user || ''}` : isMpim ? 'group_dm' : ''),
          is_private: channel.is_private || isIm || isMpim,
          is_archived: channel.is_archived || false,
          is_member: channel.is_member || false,
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

      const ids = channels.map((channel: { id: string }) => channel.id)
      const names = channels.map((channel: { name: string }) => channel.name)

      return {
        success: true,
        output: {
          channels,
          ids,
          names,
          count: channels.length,
        },
      }
    },

    outputs: {
      channels: {
        type: 'array',
        description: 'Array of channel objects from the workspace',
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
    },
  }
