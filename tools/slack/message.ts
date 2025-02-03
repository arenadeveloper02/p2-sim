import { ToolConfig, ToolResponse } from '../types'

export interface SlackMessageParams {
  apiKey: string
  channel: string
  text: string
}

export interface SlackMessageResponse extends ToolResponse {
  output: {
    ts: string
    channel: string
  }
}

export const slackMessageTool: ToolConfig<SlackMessageParams, SlackMessageResponse> = {
  id: 'slack.message',
  name: 'Slack Message',
  description: 'Send a message to a Slack channel',
  version: '1.0.0',

  params: {
    apiKey: {
      type: 'string',
      required: true,
      description: 'Your Slack API token'
    },
    channel: {
      type: 'string',
      required: true,
      description: 'Target Slack channel (e.g., #general)'
    },
    text: {
      type: 'string',
      required: true,
      description: 'Message text to send'
    }
  },

  request: {
    url: 'https://slack.com/api/chat.postMessage',
    method: 'POST',
    headers: (params: SlackMessageParams) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`
    }),
    body: (params: SlackMessageParams) => ({
      channel: params.channel,
      text: params.text
    })
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()
    if (!data.ok) {
      throw new Error(data.error || 'Slack API error')
    }
    return {
      success: true,
      output: {
        ts: data.ts,
        channel: data.channel
      }
    }
  },

  transformError: (error: any) => {
    const message = error.message || 'Slack message failed'
    return message
  }
}
