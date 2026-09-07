import { filterUndefined } from '@sim/utils/object'
import { z } from 'zod'
import type { SlackListChannelsParams, SlackListChannelsResponse } from '@/tools/slack/types'
import { CONVERSATION_LIST_OUTPUT_PROPERTIES } from '@/tools/slack/types'
import {
  assertSlackApiSuccess,
  requireSlackString,
  resolveSlackAccessToken,
} from '@/tools/slack/utils'
import type { ToolConfig } from '@/tools/types'

type SlackConversation = SlackListChannelsResponse['output']['channels'][number]

const optionalString = z.string().optional()
const optionalBoolean = z.boolean().optional()
const optionalNumber = z.number().finite().optional()
const conversationText = z.object({ value: optionalString }).optional()

const slackConversationSchema = z.object({
  id: z.string().trim().min(1, 'Slack conversation ID is required'),
  name: optionalString,
  is_channel: optionalBoolean,
  is_group: optionalBoolean,
  is_im: optionalBoolean,
  is_mpim: optionalBoolean,
  user: optionalString,
  is_user_deleted: optionalBoolean,
  is_open: optionalBoolean,
  is_private: optionalBoolean,
  is_archived: optionalBoolean,
  is_general: optionalBoolean,
  is_member: optionalBoolean,
  is_shared: optionalBoolean,
  is_ext_shared: optionalBoolean,
  is_org_shared: optionalBoolean,
  num_members: optionalNumber,
  topic: conversationText,
  purpose: conversationText,
  created: optionalNumber,
  creator: optionalString,
  updated: optionalNumber,
  priority: optionalNumber,
})

const slackListConversationsResponseSchema = z.object({
  ok: z.boolean(),
  error: optionalString,
  channels: z.array(slackConversationSchema).optional(),
  response_metadata: z.object({ next_cursor: optionalString }).optional(),
})

function mapSlackConversation(
  conversation: z.output<typeof slackConversationSchema>
): SlackConversation {
  const { id, topic, purpose, ...fields } = conversation
  return {
    id,
    ...filterUndefined({
      ...fields,
      topic: topic?.value,
      purpose: purpose?.value,
    }),
  }
}

function resolveConversationLimit(value: unknown): number {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return 100
  }
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('Channel limit must be an integer between 1 and 200')
  }
  return limit
}

export const slackListChannelsTool: ToolConfig<SlackListChannelsParams, SlackListChannelsResponse> =
  {
    id: 'slack_list_channels',
    name: 'Slack List Channels',
    description:
      'List accessible Slack conversations. Credential-group user tokens also return one-to-one and group direct messages.',
    version: '1.1.0',

    oauth: {
      required: true,
      provider: 'slack',
      authoritativeParams: ['credentialType'],
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
      credentialType: {
        type: 'string',
        required: false,
        visibility: 'hidden',
        description: 'Credential type supplied by authorized token resolution',
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
        description: 'Maximum number of channels to return (default: 200, max: 200)',
      },
      cursor: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description: 'Pagination cursor from a previous response.next_cursor',
      },
    },

    request: {
      url: (params) => {
        const url = new URL('https://slack.com/api/conversations.list')
        const isTrue = (v: unknown): boolean => v === true || v === 'true'
        const isFalse = (v: unknown): boolean => v === false || v === 'false'
        const conversationTypes = ['public_channel']
        if (!isFalse(params.includePrivate)) {
          conversationTypes.push('private_channel')
        }
        if (isTrue(params.includeDMs) || params.credentialType === 'managed_oauth') {
          conversationTypes.push('im')
        }
        if (isTrue(params.includeGroupDMs) || params.credentialType === 'managed_oauth') {
          conversationTypes.push('mpim')
        }
        url.searchParams.set('types', [...new Set(conversationTypes)].join(','))
        url.searchParams.set('exclude_archived', String(!isFalse(params.excludeArchived)))
        url.searchParams.set('limit', String(resolveConversationLimit(params.limit)))
        if (params.cursor !== undefined && params.cursor !== null) {
          url.searchParams.set('cursor', requireSlackString(params.cursor, 'Pagination cursor'))
        }
        return url.toString()
      },
      method: 'GET',
      headers: (params) => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolveSlackAccessToken(params)}`,
      }),
    },

    transformResponse: async (response) => {
      const raw = await response.json()
      if (raw && typeof raw === 'object' && raw.ok === false) {
        if (raw.error === 'missing_scope') {
          const needed = raw.needed ? ` Missing scope: ${raw.needed}.` : ''
          throw new Error(
            `Missing required permissions. Please reconnect your Slack account with the necessary scopes (channels:read for public channels, groups:read for private channels, im:read for DMs, mpim:read for group DMs).${needed}`
          )
        }
        if (raw.error === 'invalid_auth') {
          throw new Error('Invalid authentication. Please check your Slack credentials.')
        }
      }
      const data = slackListConversationsResponseSchema.parse(raw)
      assertSlackApiSuccess(data, 'Failed to list conversations from Slack')
      if (!data.channels) {
        throw new Error('Slack returned a malformed conversations list')
      }

      const channels = data.channels.map((conversation) => {
        const mapped = mapSlackConversation(conversation)
        const isIm = Boolean(mapped.is_im)
        const isMpim = Boolean(mapped.is_mpim)
        return {
          ...mapped,
          name:
            mapped.name || (isIm ? `dm:${mapped.user || ''}` : isMpim ? 'group_dm' : mapped.name),
          is_private: mapped.is_private || isIm || isMpim,
        }
      })
      const ids = channels.map((conversation) => conversation.id)
      const names = channels.flatMap((conversation) =>
        conversation.name === undefined || conversation.name === '' ? [] : [conversation.name]
      )
      const nextCursor = data.response_metadata?.next_cursor?.trim() || null

      return {
        success: true,
        output: {
          channels,
          ids,
          names,
          count: channels.length,
          nextCursor,
        },
      }
    },

    outputs: {
      channels: {
        type: 'array',
        description:
          'Accessible public and private channels, plus direct and group DMs for credential-group user tokens',
        items: {
          type: 'object',
          properties: CONVERSATION_LIST_OUTPUT_PROPERTIES,
        },
      },
      ids: {
        type: 'array',
        description: 'Conversation IDs for every returned channel or DM',
        items: { type: 'string', description: 'Slack conversation ID' },
      },
      names: {
        type: 'array',
        description: 'Names of returned channels and group DMs; one-to-one DMs have no name',
        items: { type: 'string', description: 'Slack conversation name' },
      },
      count: {
        type: 'number',
        description: 'Total number of conversations returned',
      },
      nextCursor: {
        type: 'string',
        description: 'Cursor for the next page; null if no more pages',
        optional: true,
      },
    },
  }
