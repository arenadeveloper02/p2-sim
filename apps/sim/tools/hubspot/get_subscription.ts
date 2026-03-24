import { createLogger } from '@sim/logger'
import type {
  HubSpotGetSubscriptionParams,
  HubSpotGetSubscriptionResponse,
} from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotGetSubscription')

export const hubspotGetSubscriptionTool: ToolConfig<
  HubSpotGetSubscriptionParams,
  HubSpotGetSubscriptionResponse
> = {
  id: 'hubspot_get_subscription',
  name: 'Get Subscription from HubSpot',
  description: 'Retrieve a single subscription by ID from HubSpot CRM',
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
    subscriptionId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'The ID of the subscription to retrieve',
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
      const baseUrl = `https://api.hubapi.com/crm/v3/objects/subscriptions/${params.subscriptionId}`
      const queryParams = new URLSearchParams()
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
      throw new Error(data.message || 'Failed to get subscription from HubSpot')
    }
    return {
      success: true,
      output: {
        subscription: data,
        subscriptionId: data.id,
        success: true,
      },
    }
  },

  outputs: {
    subscription: {
      type: 'object',
      description: 'HubSpot subscription object with properties',
    },
    subscriptionId: { type: 'string', description: 'The retrieved subscription ID' },
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
