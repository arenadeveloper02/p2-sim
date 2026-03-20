import { createLogger } from '@sim/logger'
import type { HubSpotGetImportParams, HubSpotGetImportResponse } from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotGetImport')

/**
 * Get information on a single CRM import by ID.
 */
export const hubspotGetImportTool: ToolConfig<HubSpotGetImportParams, HubSpotGetImportResponse> = {
  id: 'hubspot_get_import',
  name: 'Get Import from HubSpot',
  description: 'Get information on a single CRM import by ID',
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
    importId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'The ID of the import to retrieve',
    },
  },

  request: {
    url: (params) => `https://api.hubapi.com/crm/v3/imports/${params.importId}`,
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
      throw new Error(data.message || 'Failed to get import from HubSpot')
    }
    return {
      success: true,
      output: {
        import: data,
        importId: data.id,
        success: true,
      },
    }
  },

  outputs: {
    import: { type: 'object', description: 'HubSpot import object with state, metadata, etc.' },
    importId: { type: 'string', description: 'The retrieved import ID' },
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
