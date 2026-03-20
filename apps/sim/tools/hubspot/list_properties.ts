import { createLogger } from '@sim/logger'
import type {
  HubSpotListPropertiesParams,
  HubSpotListPropertiesResponse,
} from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotListProperties')

/**
 * Read all properties for a CRM object type.
 */
export const hubspotListPropertiesTool: ToolConfig<
  HubSpotListPropertiesParams,
  HubSpotListPropertiesResponse
> = {
  id: 'hubspot_list_properties',
  name: 'List Properties from HubSpot',
  description: 'Read all property definitions for a CRM object type',
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
      description: 'CRM object type (e.g. contacts, companies, deals)',
    },
    dataSensitivity: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Filter by data sensitivity (e.g. non_sensitive). Optional.',
    },
  },

  request: {
    url: (params) => {
      const baseUrl = `https://api.hubapi.com/crm/v3/properties/${params.objectType}`
      const queryParams = new URLSearchParams()
      if (params.dataSensitivity) {
        queryParams.append('dataSensitivity', params.dataSensitivity)
      }
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
      throw new Error(data.message || 'Failed to list properties from HubSpot')
    }
    const results = Array.isArray(data.results) ? data.results : data
    return {
      success: true,
      output: {
        results,
        success: true,
      },
    }
  },

  outputs: {
    results: { type: 'array', description: 'Array of property definitions' },
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
