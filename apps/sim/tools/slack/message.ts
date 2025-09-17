import type { SlackMessageParams, SlackMessageResponse } from '@/tools/slack/types'
import type { ToolConfig } from '@/tools/types'
import { SlackRateLimitHandler } from '@/lib/slack/rate-limit-handler'

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
  },

  request: {
    url: 'https://slack.com/api/chat.postMessage',
    method: 'POST',
    headers: (params: SlackMessageParams) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken || params.botToken}`,
    }),
    body: (params: SlackMessageParams) => {
      const body: any = {
        channel: params.channel,
        markdown_text: params.text,
      }

      return body
    },
  },

  transformResponse: async (response: Response) => {
    // Handle rate limiting
    if (response.status === 429) {
      const rateLimitInfo = SlackRateLimitHandler.extractRateLimitInfo(response)
      let errorMessage = 'Slack API rate limit exceeded'

      if (rateLimitInfo.retryAfter) {
        errorMessage += `. Retry after ${rateLimitInfo.retryAfter} seconds.`
      } else if (rateLimitInfo.reset) {
        errorMessage += `. Resets at ${rateLimitInfo.reset.toISOString()}.`
      } else {
        errorMessage += '. Please try again later.'
      }

      throw new Error(errorMessage)
    }

    const data = await response.json()

    if (!response.ok || !data.ok) {
      const errorMessage =
        data.error || `Slack API error: ${response.status} ${response.statusText}`
      throw new Error(errorMessage)
    }

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
