import type { SlackMessageParams, SlackMessageResponse } from '@/tools/slack/types'
import type { ToolConfig } from '@/tools/types'

export const slackMessageTool: ToolConfig<SlackMessageParams, SlackMessageResponse> = {
  id: 'slack_message',
  name: 'Slack Message',
  description:
    'Send messages to Slack channels or users through the Slack API. Supports Slack mrkdwn formatting.',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'slack',
    additionalScopes: [
      'channels:read',
      'groups:read',
      'chat:write',
      'chat:write.public',
      'users:read',
    ],
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
    channel: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Target Slack channel (e.g., #general)',
    },
    text: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Message text to send (supports Slack mrkdwn formatting)',
    },
    mergeMessages: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Whether to merge multiple messages into a single block',
    },
    additionalMessages: {
      type: 'array',
      required: false,
      visibility: 'user-or-llm',
      description: 'Additional messages to merge with the main message',
    },
    mentionUsers: {
      type: 'array',
      required: false,
      visibility: 'user-or-llm',
      description: 'User IDs to mention in the message',
    },
  },

  request: {
    url: 'https://slack.com/api/chat.postMessage',
    method: 'POST',
    headers: (params: SlackMessageParams) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken || params.botToken}`,
    }),
    body: (params: SlackMessageParams) => {
      let messageText = params.text

      // Handle user mentions
      if (params.mentionUsers && params.mentionUsers.length > 0) {
        const mentions = params.mentionUsers.map((userId) => `<@${userId}>`).join(' ')
        messageText = `${mentions} ${messageText}`
      }

      // Handle message merging
      if (
        params.mergeMessages &&
        params.additionalMessages &&
        params.additionalMessages.length > 0
      ) {
        // Process @ mentions in additional messages
        const processedAdditionalMessages = params.additionalMessages.map((msg) => {
          // Convert @username mentions to <@userId> format
          // Note: In a real implementation, you'd want to resolve usernames to user IDs
          // For now, we'll keep the @username format as Slack will handle the resolution
          return msg
        })

        const allMessages = [messageText, ...processedAdditionalMessages]
        messageText = allMessages.join('\n\n')
      }

      const body: any = {
        channel: params.channel,
        text: messageText,
        // Enable link parsing for proper mention handling
        link_names: true,
        // Enable unfurling of links
        unfurl_links: true,
        unfurl_media: true,
      }

      // Add thread timestamp if provided
      if (params.thread_ts) {
        body.thread_ts = params.thread_ts
      }

      return body
    },
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()
    return {
      success: true,
      output: {
        ts: data.ts,
        channel: data.channel,
      },
    }
  },

  outputs: {
    ts: { type: 'string', description: 'Message timestamp' },
    channel: { type: 'string', description: 'Channel ID where message was sent' },
  },
}
