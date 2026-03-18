import { createLogger } from '@sim/logger'
import type { HubSpotListImportsParams, HubSpotListImportsResponse } from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotListImports')

/**
 * Get active CRM imports (list from /crm/v3/imports/).
 */
export const hubspotListImportsTool: ToolConfig<
  HubSpotListImportsParams,
  HubSpotListImportsResponse
> = {
  id: 'hubspot_list_imports',
  name: 'List Imports from HubSpot',
  description: 'Get active CRM imports with pagination support',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'hubspot',
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'The access token for the HubSpot API',
    },
    limit: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Maximum number of results per page (default 10)',
    },
    after: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Pagination cursor for next page of results',
    },
  },

  request: {
    url: (params) => {
      const baseUrl = 'https://api.hubapi.com/crm/v3/imports'
      const queryParams = new URLSearchParams()
      if (params.limit) queryParams.append('limit', params.limit)
      if (params.after) queryParams.append('after', params.after)
      const queryString = queryParams.toString()
      return queryString ? `${baseUrl}?${queryString}` : baseUrl
    },
    method: 'GET',
    headers: (params) => {
      if (!params.accessToken) throw new Error('Access token is required')
      return {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      }
    },
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()
    if (!response.ok) {
      logger.error('HubSpot API request failed', { data, status: response.status })
      throw new Error(data.message || 'Failed to list imports from HubSpot')
    }
    return {
      success: true,
      output: {
        results: data.results || [],
        paging: data.paging ?? null,
        metadata: {
          totalReturned: data.results?.length || 0,
          hasMore: !!data.paging?.next,
        },
        success: true,
      },
    }
  },

  outputs: {
    results: { type: 'array', description: 'Array of HubSpot import objects' },
    paging: { type: 'object', description: 'Pagination information', optional: true },
    metadata: { type: 'object', description: 'Metadata with totalReturned and hasMore' },
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
