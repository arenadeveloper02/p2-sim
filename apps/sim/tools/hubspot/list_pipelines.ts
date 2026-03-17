import { createLogger } from '@sim/logger'
import type {
  HubSpotListPipelinesParams,
  HubSpotListPipelinesResponse,
} from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotListPipelines')

/**
 * List pipelines for a CRM object type (e.g. deals, tickets).
 */
export const hubspotListPipelinesTool: ToolConfig<
  HubSpotListPipelinesParams,
  HubSpotListPipelinesResponse
> = {
  id: 'hubspot_list_pipelines',
  name: 'List Pipelines from HubSpot',
  description: 'List pipelines for a CRM object type (e.g. deals, tickets)',
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
      description: 'CRM object type (e.g. deals, tickets)',
    },
  },

  request: {
    url: (params) => `https://api.hubapi.com/crm/v3/pipelines/${params.objectType}`,
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
      throw new Error(data.message || 'Failed to list pipelines from HubSpot')
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
    results: { type: 'array', description: 'Array of pipeline objects with stages' },
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
