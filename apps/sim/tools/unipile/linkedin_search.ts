import type { ToolConfig } from '@/tools/types'
import type {
  UnipileLinkedinSearchParams,
  UnipileLinkedinSearchToolResponse,
} from '@/tools/unipile/types'

export const unipileLinkedinSearchTool: ToolConfig<
  UnipileLinkedinSearchParams,
  UnipileLinkedinSearchToolResponse
> = {
  id: 'unipile_linkedin_search',
  name: 'Unipile LinkedIn Search',
  description:
    'Runs a LinkedIn search (`POST /api/v1/linkedin/search`). Pass a JSON object as `search_body` (category, keywords, filters, etc.). Uses server `UNIPILE_API_KEY`.',
  version: '1.0.0',

  params: {
    search_body: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Stringified JSON object for the Unipile LinkedIn search request body',
    },
  },

  request: {
    url: '/api/tools/unipile/linkedin-search',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      search_body: params.search_body,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Unipile request failed')
    }

    const rawItems = data.items
    const items = Array.isArray(rawItems) ? rawItems : []
    const paging =
      data.paging && typeof data.paging === 'object' && data.paging !== null
        ? (data.paging as Record<string, unknown>)
        : null
    const config =
      data.config && typeof data.config === 'object' && data.config !== null
        ? (data.config as Record<string, unknown>)
        : null
    const metadata =
      data.metadata && typeof data.metadata === 'object' && data.metadata !== null
        ? (data.metadata as Record<string, unknown>)
        : null
    const pagingCursor =
      paging && typeof paging.cursor === 'string' ? (paging.cursor as string) : null
    const topCursor = typeof data.cursor === 'string' ? data.cursor : null

    return {
      success: true,
      output: {
        object: typeof data.object === 'string' ? data.object : null,
        item_count: items.length,
        items,
        cursor: topCursor ?? pagingCursor,
        paging,
        config,
        metadata,
      },
    }
  },

  outputs: {
    object: {
      type: 'string',
      description: 'Unipile object type (e.g. LinkedinSearch)',
      optional: true,
    },
    item_count: { type: 'number', description: 'Number of search results in this page' },
    items: { type: 'json', description: 'Search result items' },
    cursor: { type: 'string', description: 'Next page cursor', optional: true },
    paging: { type: 'json', description: 'Paging metadata', optional: true },
    config: { type: 'json', description: 'Echoed search config when present', optional: true },
    metadata: {
      type: 'json',
      description: 'Search metadata (history/context/request ids) when present',
      optional: true,
    },
  },
}
