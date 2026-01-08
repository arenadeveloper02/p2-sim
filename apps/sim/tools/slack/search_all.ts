import type { SlackSearchAllParams, SlackSearchAllResponse } from '@/tools/slack/types'
import type { ToolConfig } from '@/tools/types'

export const slackSearchAllTool: ToolConfig<SlackSearchAllParams, SlackSearchAllResponse> = {
  id: 'slack_search_all',
  name: 'Slack Search All',
  description:
    'Search across messages, files, and posts in Slack using the search.all API with optional sorting and pagination.',
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
    query: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Search query string (e.g., "messages in:#alerts after:2024-12-01 before:2024-12-05"). Supports Slack search syntax.',
    },
    highlight: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Whether to enable match highlighting in results (default: true).',
    },
    page: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Page number for paginated results (1-based).',
    },
    sort: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Sort field. Default: score. Example: timestamp.',
    },
    sort_dir: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Sort direction. Allowed values: desc, asc. Default: desc.',
    },
  },

  request: {
    url: '/api/tools/slack/search-all',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: SlackSearchAllParams) => {
      // Check if accessToken is a bot token (search.all requires user token)
      if (params.accessToken?.startsWith('xoxb-')) {
        throw new Error(
          'search.all API requires a user token (OAuth), not a bot token. Please connect your Slack account using OAuth authentication instead of a bot token.'
        )
      }

      // Check if botToken is provided (search.all doesn't support bot tokens)
      if (params.botToken) {
        throw new Error(
          'search.all API requires a user token (OAuth), not a bot token. Please use OAuth authentication.'
        )
      }

      return {
        // Pass credential ID if available, otherwise pass accessToken
        // The route will resolve credential to OAuth token (search.all requires user token)
        credential: params.accessToken, // accessToken might be credential ID from tool execution
        accessToken: params.accessToken, // Keep for backward compatibility
        botToken: params.botToken,
        query: params.query,
        highlight: params.highlight,
        page: params.page,
        sort: params.sort,
        sort_dir: params.sort_dir,
      }
    },
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()

    if (!data.success) {
      throw new Error(data.error || 'Failed to perform Slack search.all')
    }

    // Extract text from messages, files, and posts
    const messageTexts: string[] = []
    const fileTexts: string[] = []
    const postTexts: string[] = []

    // Log channel information from search results
    const channelsFound: Array<{ type: string; channelId?: string; channelName?: string }> = []

    // Extract text from message matches
    if (data.output?.messages?.matches) {
      for (const match of data.output.messages.matches) {
        if (match.text) {
          messageTexts.push(match.text)
        }
        // Log channel information from messages
        if (match.channel) {
          const channelInfo: any = { type: 'message' }
          if (typeof match.channel === 'object') {
            channelInfo.channelId = match.channel.id
            channelInfo.channelName = match.channel.name
          } else {
            channelInfo.channelId = match.channel
          }
          channelsFound.push(channelInfo)
        }
      }
    }

    // Extract text from file matches (title, name, or initial_comment)
    if (data.output?.files?.matches) {
      for (const match of data.output.files.matches) {
        if (match.title) {
          fileTexts.push(match.title)
        } else if (match.name) {
          fileTexts.push(match.name)
        }
        if (match.initial_comment?.comment) {
          fileTexts.push(match.initial_comment.comment)
        }
        // Log channel information from files
        if (match.channels && Array.isArray(match.channels)) {
          match.channels.forEach((ch: any) => {
            channelsFound.push({
              type: 'file',
              channelId: typeof ch === 'object' ? ch.id : ch,
              channelName: typeof ch === 'object' ? ch.name : undefined,
            })
          })
        }
      }
    }

    // Extract text from post matches
    if (data.output?.posts?.matches) {
      for (const match of data.output.posts.matches) {
        if (match.text) {
          postTexts.push(match.text)
        }
        // Log channel information from posts
        if (match.channel) {
          const channelInfo: any = { type: 'post' }
          if (typeof match.channel === 'object') {
            channelInfo.channelId = match.channel.id
            channelInfo.channelName = match.channel.name
          } else {
            channelInfo.channelId = match.channel
          }
          channelsFound.push(channelInfo)
        }
      }
    }

    // Log all channels found in search results
    if (channelsFound.length > 0) {
      console.log('[Slack Search All] Channels found in search results:', channelsFound)
    }

    // Combine all text
    const allTexts = [...messageTexts, ...fileTexts, ...postTexts]
    const combinedText = allTexts.join('\n\n')

    return {
      success: true,
      output: {
        ...data.output,
        // Add extracted text fields
        text: combinedText,
        messageTexts: messageTexts.join('\n\n'),
        fileTexts: fileTexts.join('\n\n'),
        postTexts: postTexts.join('\n\n'),
      },
    }
  },
}
