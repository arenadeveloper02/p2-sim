import type { ToolConfig } from '@/tools/types'
import { parseUnipilePagedBody } from '@/tools/unipile/parse_paged_body'
import type {
  UnipileListUserRelationsParams,
  UnipileListUserRelationsToolResponse,
} from '@/tools/unipile/types'

export const unipileListUserRelationsTool: ToolConfig<
  UnipileListUserRelationsParams,
  UnipileListUserRelationsToolResponse
> = {
  id: 'unipile_list_user_relations',
  name: 'Unipile List User Relations',
  description:
    'Lists all LinkedIn relations for an account (`GET /api/v1/users/relations`), following cursor pagination internally until complete (with safety caps). Uses server `UNIPILE_API_KEY`.',
  version: '1.0.0',

  params: {
    account_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unipile connected account id',
    },
    filter: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional Unipile `filter` query (match by user name)',
    },
  },

  request: {
    url: '/api/tools/unipile/list-user-relations',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      account_id: params.account_id?.trim(),
      filter: params.filter,
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
      description: 'Unipile object type (e.g. UserRelationsList)',
      optional: true,
    },
    item_count: { type: 'number', description: 'Number of relations' },
    items: { type: 'json', description: 'UserRelation items' },
    cursor: { type: 'string', description: 'Pagination cursor when present', optional: true },
    paging: { type: 'json', description: 'Paging metadata when present', optional: true },
    total_items: {
      type: 'number',
      description: 'Total items when returned by API',
      optional: true,
    },
    fetch_all: {
      type: 'boolean',
      description: 'True when backend fetched all pages internally',
      optional: true,
    },
    pages_fetched: {
      type: 'number',
      description: 'Number of upstream pages fetched',
      optional: true,
    },
    truncated: {
      type: 'boolean',
      description: 'True when a safety cap stopped early',
      optional: true,
    },
    truncation_reason: {
      type: 'string',
      description: 'When truncated: max_pages or max_items',
      optional: true,
    },
  },
}
