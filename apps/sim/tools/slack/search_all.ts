import type { ToolConfig } from '@/tools/types'
import type { SlackSearchAllParams, SlackSearchAllResponse } from './types'

export const slackSearchAllTool: ToolConfig<SlackSearchAllParams, SlackSearchAllResponse> = {
  id: 'slack_search_all',
  name: 'Slack Search All',
  description: 'Search all content in Slack (messages and files) that the user has access to.',
  version: '1.0.0',
  oauth: {
    required: true,
    provider: 'slack',
    useUserToken: true, // This tool requires user token instead of bot token
  },
  params: {
    accessToken: {
      type: 'string',
      required: false,
      visibility: 'hidden',
      description: 'Slack access token for authentication',
    },
    userToken: {
      type: 'string',
      required: false,
      visibility: 'hidden',
      description: 'User access token for Slack search API',
    },
    query: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Search query string',
    },
    count: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Number of results to return per page (1-100, default: 50)',
    },
    page: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Page number for pagination (default: 1)',
    },
    sort: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Sort results by (timestamp, score, relevance)',
    },
    sort_dir: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Sort direction (asc, desc)',
    },
    highlight: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Highlight search terms in results (default: true)',
    },
  },
  request: {
    url: '/api/tools/slack/search-all',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params: SlackSearchAllParams) => ({
      accessToken: (params as any).userToken || params.accessToken,
      query: params.query,
      count: params.count || 50,
      page: params.page || 1,
      sort: (params as any).sort || 'timestamp',
      sort_dir: (params as any).sort_dir || 'desc',
      highlight: (params as any).highlight !== false,
    }),
  },
  transformResponse: async (response: Response) => {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    const data = await response.json()
    return data
  },
}
