import { SlackIcon } from '@/components/icons' 
import { BlockConfig } from '../types'
import { SlackMessageResponse } from '@/tools/slack/message'

export const SlackMessageBlock: BlockConfig<SlackMessageResponse> = {
  type: 'slack_message',
  toolbar: {
    title: 'Slack Message',
    description: 'Send a message to Slack',
    bgColor: '#611f69',
    icon: SlackIcon,
    category: 'advanced'
  },
  tools: {
    access: ['slack.message']
  },
  workflow: {
    inputs: {
      apiKey: { type: 'string', required: true },
      channel: { type: 'string', required: true },
      text: { type: 'string', required: true }
    },
    outputs: {
      response: {
        type: {
          ts: 'string',
          channel: 'string'
        }
      }
    },
    subBlocks: [
      {
        id: 'apiKey',
        title: 'OAuth Token',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter your Slack OAuth token',
        password: true,
        connectionDroppable: false
      },
      {
        id: 'channel',
        title: 'Channel',
        type: 'short-input',
        layout: 'full',
        placeholder: 'Enter Slack channel (e.g., #general)'
      },
      {
        id: 'text',
        title: 'Message',
        type: 'long-input',
        layout: 'full',
        placeholder: 'Enter your alert message'
      }
    ]
  }
} 