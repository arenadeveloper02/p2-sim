import { createLogger } from '@sim/logger'
import type {
  HubSpotGetCommercePaymentParams,
  HubSpotGetCommercePaymentResponse,
} from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotGetCommercePayment')

export const hubspotGetCommercePaymentTool: ToolConfig<
  HubSpotGetCommercePaymentParams,
  HubSpotGetCommercePaymentResponse
> = {
  id: 'hubspot_get_commerce_payment',
  name: 'Get Commerce Payment from HubSpot',
  description: 'Retrieve a single commerce payment by ID from HubSpot CRM',
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
    commercePaymentId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'The ID of the commerce payment to retrieve',
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
      const baseUrl = `https://api.hubapi.com/crm/v3/objects/commerce_payments/${params.commercePaymentId}`
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
      throw new Error(data.message || 'Failed to get commerce payment from HubSpot')
    }
    return {
      success: true,
      output: {
        commercePayment: data,
        commercePaymentId: data.id,
        success: true,
      },
    }
  },

  outputs: {
    commercePayment: {
      type: 'object',
      description: 'HubSpot commerce payment object with properties',
    },
    commercePaymentId: { type: 'string', description: 'The retrieved commerce payment ID' },
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
