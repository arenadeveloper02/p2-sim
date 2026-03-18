import { createLogger } from '@sim/logger'
import type { HubSpotGetObjectParams, HubSpotGetObjectResponse } from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotGetObject')

/**
 * Get a single CRM object by type and ID. Use for appointments, courses (0-410),
 * deals (0-3), discounts, custom objects, or any CRM object type.
 */
export const hubspotGetObjectTool: ToolConfig<HubSpotGetObjectParams, HubSpotGetObjectResponse> = {
  id: 'hubspot_get_object',
  name: 'Get CRM Object from HubSpot',
  description:
    'Retrieve a single CRM object by type and ID (e.g. appointment, course 0-410, deal 0-3, discount, custom object)',
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
      description:
        'CRM object type (e.g. appointments, 0-410 for courses, 0-3 for deals, discounts, or custom object type ID)',
    },
    objectId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'ID of the CRM object to retrieve',
    },
    idProperty: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Property to use as unique identifier. If not specified, uses record ID',
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
      const baseUrl = `https://api.hubapi.com/crm/v3/objects/${params.objectType}/${params.objectId}`
      const queryParams = new URLSearchParams()
      if (params.idProperty) queryParams.append('idProperty', params.idProperty)
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
      throw new Error(data.message || 'Failed to get CRM object from HubSpot')
    }
    return {
      success: true,
      output: {
        object: data,
        objectId: data.id,
        success: true,
      },
    }
  },

  outputs: {
    object: { type: 'object', description: 'HubSpot CRM object with properties' },
    objectId: { type: 'string', description: 'The retrieved object ID' },
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
