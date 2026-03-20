import { createLogger } from '@sim/logger'
import type {
  HubSpotListAssociationTypesParams,
  HubSpotListAssociationTypesResponse,
} from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotListAssociationTypes')

/**
 * List association types between two CRM object types (e.g. contact_to_company).
 */
export const hubspotListAssociationTypesTool: ToolConfig<
  HubSpotListAssociationTypesParams,
  HubSpotListAssociationTypesResponse
> = {
  id: 'hubspot_list_association_types',
  name: 'List Association Types from HubSpot',
  description: 'List association types between two CRM object types (e.g. contacts and companies)',
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
    fromObjectType: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Source object type (e.g. contacts, companies, deals)',
    },
    toObjectType: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Target object type (e.g. companies, contacts, deals)',
    },
  },

  request: {
    url: (params) =>
      `https://api.hubapi.com/crm/v3/associations/${params.fromObjectType}/${params.toObjectType}/types`,
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
      throw new Error(data.message || 'Failed to list association types from HubSpot')
    }
    return {
      success: true,
      output: {
        results: data.results || [],
        success: true,
      },
    }
  },

  outputs: {
    results: { type: 'array', description: 'Association type definitions (id, name)' },
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
