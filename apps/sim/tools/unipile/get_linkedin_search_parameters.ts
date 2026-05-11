import type { ToolConfig } from '@/tools/types'
import { parseUnipilePagedBody } from '@/tools/unipile/parse_paged_body'
import type {
  UnipileGetLinkedinSearchParametersParams,
  UnipileGetLinkedinSearchParametersToolResponse,
} from '@/tools/unipile/types'

export const unipileGetLinkedinSearchParametersTool: ToolConfig<
  UnipileGetLinkedinSearchParametersParams,
  UnipileGetLinkedinSearchParametersToolResponse
> = {
  id: 'unipile_get_linkedin_search_parameters',
  name: 'Unipile Retrieve LinkedIn search parameters',
  description:
    'Returns LinkedIn search parameter IDs for building a search body (`GET /api/v1/linkedin/search/parameters`). LinkedIn expects IDs, not raw labels. Guide: https://developer.unipile.com/docs/linkedin-search Uses server UNIPILE_API_KEY.',
  version: '1.0.0',

  params: {
    account_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unipile account id (required query param)',
    },
    type: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Required: which parameter list to fetch (e.g. LOCATION, PEOPLE, COMPANY, … per Unipile docs).',
    },
    service: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'CLASSIC (default), RECRUITER, or SALES_NAVIGATOR — which LinkedIn API surface to query.',
    },
    keywords: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional keywords seed (not applicable when type is EMPLOYMENT_TYPE).',
    },
    limit: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional page size 1–100 (Unipile default 10).',
    },
  },

  request: {
    url: '/api/tools/unipile/get-linkedin-search-parameters',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => {
      const out: Record<string, unknown> = {
        account_id: params.account_id?.trim(),
        type: typeof params.type === 'string' ? params.type.trim() : '',
      }
      if (typeof params.service === 'string' && params.service.trim() !== '') {
        out.service = params.service.trim()
      }
      if (typeof params.keywords === 'string' && params.keywords.trim() !== '') {
        out.keywords = params.keywords.trim()
      }
      if (
        params.limit !== undefined &&
        params.limit !== null &&
        Number.isFinite(Number(params.limit))
      ) {
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

    return {
      success: true,
      output: parseUnipilePagedBody(data),
    }
  },

  outputs: {
    object: {
      type: 'string',
      description: 'Unipile object type (e.g. LinkedinSearchParametersList)',
      optional: true,
    },
    item_count: { type: 'number', description: 'Number of parameter rows returned' },
    items: { type: 'json', description: 'LinkedIn search parameter items (id, title, …)' },
    cursor: { type: 'string', description: 'Pagination cursor when present', optional: true },
    paging: { type: 'json', description: 'Paging metadata (e.g. page_count)', optional: true },
    total_items: {
      type: 'number',
      description: 'Total items when returned by API',
      optional: true,
    },
  },
}
