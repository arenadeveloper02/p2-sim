import type { ToolConfig } from '@/tools/types'
import { parseUnipilePagedBody } from '@/tools/unipile/parse_paged_body'
import type {
  UnipileListUserPostsParams,
  UnipileListUserPostsToolResponse,
} from '@/tools/unipile/types'

export const unipileListUserPostsTool: ToolConfig<
  UnipileListUserPostsParams,
  UnipileListUserPostsToolResponse
> = {
  id: 'unipile_list_user_posts',
  name: 'Unipile List User Posts',
  description:
    'Lists posts for a user (`GET /api/v1/users/{identifier}/posts`). Optional `cursor` for pagination. Uses server `UNIPILE_API_KEY`.',
  version: '1.0.0',

  params: {
    user_identifier: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'User identifier (Unipile path segment)',
    },
    cursor: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Pagination cursor from a previous response',
    },
  },

  request: {
    url: '/api/tools/unipile/list-user-posts',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      user_identifier: params.user_identifier?.trim(),
      cursor: params.cursor,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Unipile request failed')
    }

    return {
      success: true,
      output: parseUnipilePagedBody(data),
    }
  },

  outputs: {
    object: { type: 'string', description: 'Unipile object type (e.g. PostList)', optional: true },
    item_count: { type: 'number', description: 'Number of posts in this page' },
    items: { type: 'json', description: 'Post items' },
    cursor: { type: 'string', description: 'Next page cursor', optional: true },
    paging: { type: 'json', description: 'Paging metadata', optional: true },
    total_items: { type: 'number', description: 'Total items when returned by API', optional: true },
  },
}
