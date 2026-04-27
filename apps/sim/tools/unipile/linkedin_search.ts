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
  name: 'Unipile Perform Linkedin search',
  description:
    'Runs LinkedIn Classic, Sales Navigator, or Recruiter search (`POST /api/v1/linkedin/search`). Use Retrieve LinkedIn search parameters for filter IDs. Guide: https://developer.unipile.com/docs/linkedin-search Query: account_id (required), optional cursor, limit (0–100; Classic should stay ≤50). Body: JSON per Unipile (e.g. api+category+filters, or { url }, or { cursor }). Uses server UNIPILE_API_KEY.',
  version: '1.0.0',

  params: {
    account_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unipile account id (required query parameter)',
    },
    search_body: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'JSON string for the POST body: classic people/companies/posts/jobs, sales_navigator, recruiter, { "url": "…" } to search from a public URL, or { "cursor": "…" } for a long cursor in the body.',
    },
    cursor: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional cursor query param for pagination (short cursors)',
    },
    limit: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Optional result limit 0–100 (Unipile default 10). Sales Navigator / Recruiter up to 100; LinkedIn Classic should not exceed 50.',
    },
  },

  request: {
    url: '/api/tools/unipile/linkedin-search',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => {
      const out: Record<string, unknown> = {
        account_id: params.account_id?.trim(),
        search_body:
          typeof params.search_body === 'string' && params.search_body.trim() !== ''
            ? params.search_body
            : '{}',
      }
      if (typeof params.cursor === 'string' && params.cursor.trim() !== '') {
        out.cursor = params.cursor.trim()
      }
      if (params.limit !== undefined && params.limit !== null && Number.isFinite(Number(params.limit))) {
        out.limit = Number(params.limit)
      }
      return out
    },
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
    const topCursor = typeof data.cursor === 'string' ? data.cursor : null

    return {
      success: true,
      output: {
        object: typeof data.object === 'string' ? data.object : null,
        item_count: items.length,
        items,
        cursor: topCursor,
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
