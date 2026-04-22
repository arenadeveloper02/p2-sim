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
  name: 'Unipile Get LinkedIn Search Parameters',
  description:
    'Lists LinkedIn search parameter options (`GET /api/v1/linkedin/search/parameters`). Optional `cursor` for pagination. Uses server `UNIPILE_API_KEY`.',
  version: '1.0.0',

  params: {
    cursor: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Pagination cursor from a previous response',
    },
  },

  request: {
    url: '/api/tools/unipile/get-linkedin-search-parameters',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
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
      description: 'Unipile object type (e.g. LinkedinSearchParametersList)',
      optional: true,
    },
    item_count: { type: 'number', description: 'Number of parameter rows in this page' },
    items: { type: 'json', description: 'LinkedIn search parameter items' },
    cursor: { type: 'string', description: 'Next page cursor', optional: true },
    paging: { type: 'json', description: 'Paging metadata', optional: true },
    total_items: { type: 'number', description: 'Total items when returned by API', optional: true },
  },
}
