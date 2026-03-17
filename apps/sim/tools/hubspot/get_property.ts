import { createLogger } from '@sim/logger'
import type {
  HubSpotGetPropertyParams,
  HubSpotGetPropertyResponse,
} from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotGetProperty')

/**
 * Read a single property definition for a CRM object type.
 */
export const hubspotGetPropertyTool: ToolConfig<
  HubSpotGetPropertyParams,
  HubSpotGetPropertyResponse
> = {
  id: 'hubspot_get_property',
  name: 'Get Property from HubSpot',
  description: 'Read a single property definition for a CRM object type',
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
    propertyName: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'The name of the property to retrieve',
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
      const baseUrl = `https://api.hubapi.com/crm/v3/properties/${params.objectType}/${params.propertyName}`
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
      throw new Error(data.message || 'Failed to get property from HubSpot')
    }
    return {
      success: true,
      output: {
        property: data,
        propertyName: data.name ?? '',
        success: true,
      },
    }
  },

  outputs: {
    property: { type: 'object', description: 'Property definition with label, type, options, etc.' },
    propertyName: { type: 'string', description: 'The property name' },
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
