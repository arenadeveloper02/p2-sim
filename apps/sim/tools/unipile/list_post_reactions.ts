import type { ToolConfig } from '@/tools/types'
import { parseUnipilePagedBody } from '@/tools/unipile/parse_paged_body'
import type {
  UnipileListPostReactionsParams,
  UnipileListPostReactionsToolResponse,
} from '@/tools/unipile/types'

export const unipileListPostReactionsTool: ToolConfig<
  UnipileListPostReactionsParams,
  UnipileListPostReactionsToolResponse
> = {
  id: 'unipile_list_post_reactions',
  name: 'Unipile List Post Reactions',
  description:
    'Lists reactions on a post (`GET /api/v1/posts/{post_id}/reactions`). Optional `cursor` for pagination. Uses server `UNIPILE_API_KEY`.',
  version: '1.0.0',

  params: {
    post_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unipile post id',
    },
    cursor: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Pagination cursor from a previous response',
    },
  },

  request: {
    url: '/api/tools/unipile/list-post-reactions',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      post_id: params.post_id?.trim(),
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
    object: {
      type: 'string',
      description: 'Unipile object type (e.g. PostReactionList)',
      optional: true,
    },
    item_count: { type: 'number', description: 'Number of reactions in this page' },
    items: { type: 'json', description: 'Post reaction items' },
    cursor: { type: 'string', description: 'Next page cursor', optional: true },
    paging: { type: 'json', description: 'Paging metadata', optional: true },
    total_items: {
      type: 'number',
      description: 'Total items when returned by API',
      optional: true,
    },
  },
}
