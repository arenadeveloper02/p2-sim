import { createLogger } from '@sim/logger'
import type {
  HubSpotGetPipelineParams,
  HubSpotGetPipelineResponse,
} from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotGetPipeline')

/**
 * Retrieve a single pipeline by ID for a CRM object type.
 */
export const hubspotGetPipelineTool: ToolConfig<
  HubSpotGetPipelineParams,
  HubSpotGetPipelineResponse
> = {
  id: 'hubspot_get_pipeline',
  name: 'Get Pipeline from HubSpot',
  description: 'Retrieve a single pipeline by ID for a CRM object type (e.g. deals, tickets)',
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
    pipelineId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'The ID of the pipeline to retrieve',
    },
  },

  request: {
    url: (params) =>
      `https://api.hubapi.com/crm/v3/pipelines/${params.objectType}/${params.pipelineId}`,
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
      throw new Error(data.message || 'Failed to get pipeline from HubSpot')
    }
    return {
      success: true,
      output: {
        pipeline: data,
        pipelineId: data.id,
        success: true,
      },
    }
  },

  outputs: {
    pipeline: { type: 'object', description: 'Pipeline object with stages' },
    pipelineId: { type: 'string', description: 'The retrieved pipeline ID' },
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
