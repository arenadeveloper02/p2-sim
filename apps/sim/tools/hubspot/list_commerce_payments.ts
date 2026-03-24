import { createLogger } from '@sim/logger'
import type {
  HubSpotListCommercePaymentsParams,
  HubSpotListCommercePaymentsResponse,
} from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotListCommercePayments')

export const hubspotListCommercePaymentsTool: ToolConfig<
  HubSpotListCommercePaymentsParams,
  HubSpotListCommercePaymentsResponse
> = {
  id: 'hubspot_list_commerce_payments',
  name: 'List Commerce Payments from HubSpot',
  description: 'Retrieve commerce payments from HubSpot CRM with pagination support',
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
    properties: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Comma-separated list of properties to return',
    },
    associations: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Comma-separated list of object types to retrieve associated IDs for',
    },
  },

  request: {
    url: (params) => {
      const baseUrl = 'https://api.hubapi.com/crm/v3/objects/commerce_payments'
      const queryParams = new URLSearchParams()
      if (params.limit) queryParams.append('limit', params.limit)
      if (params.after) queryParams.append('after', params.after)
      if (params.properties) queryParams.append('properties', params.properties)
      if (params.associations) queryParams.append('associations', params.associations)
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
      throw new Error(data.message || 'Failed to list commerce payments from HubSpot')
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
    results: { type: 'array', description: 'Array of HubSpot commerce payment objects' },
    paging: { type: 'object', description: 'Pagination information', optional: true },
    metadata: { type: 'object', description: 'Metadata with totalReturned and hasMore' },
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
