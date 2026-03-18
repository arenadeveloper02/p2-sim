import { createLogger } from '@sim/logger'
import type {
  HubSpotListAssociationsParams,
  HubSpotListAssociationsResponse,
} from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotListAssociations')

/**
 * List associations for a CRM object to another object type (v4 API).
 */
export const hubspotListAssociationsTool: ToolConfig<
  HubSpotListAssociationsParams,
  HubSpotListAssociationsResponse
> = {
  id: 'hubspot_list_associations',
  name: 'List Associations from HubSpot',
  description:
    'List associations from one CRM object to another object type (e.g. contact to companies)',
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
    objectType: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Object type of the source record (e.g. contacts, companies)',
    },
    objectId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'ID of the source CRM object',
    },
    toObjectType: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Object type to list associations to (e.g. companies, deals)',
    },
    limit: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Maximum number of results (default 500)',
    },
    after: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Pagination cursor for next page',
    },
  },

  request: {
    url: (params) => {
      const baseUrl = `https://api.hubapi.com/crm/v4/objects/${params.objectType}/${params.objectId}/associations/${params.toObjectType}`
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
      throw new Error(data.message || 'Failed to list associations from HubSpot')
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
    results: { type: 'array', description: 'Association records with toObjectId and types' },
    paging: { type: 'object', description: 'Pagination information', optional: true },
    metadata: { type: 'object', description: 'Metadata with totalReturned and hasMore' },
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
