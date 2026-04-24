import { createLogger } from '@sim/logger'
import type { HubSpotListContactsParams, HubSpotListContactsResponse } from '@/tools/hubspot/types'
import { CONTACTS_ARRAY_OUTPUT, METADATA_OUTPUT, PAGING_OUTPUT } from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotListContacts')

export const hubspotListContactsTool: ToolConfig<
  HubSpotListContactsParams,
  HubSpotListContactsResponse
> = {
  id: 'hubspot_list_contacts',
  name: 'List Contacts from HubSpot',
  description:
    'List contacts with pagination, or fetch a single contact when Contact ID or Email is set (matches HubSpot block “Get Contacts”).',
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
    contactId: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'HubSpot contact ID or email to fetch one contact; leave empty to list all contacts',
    },
    idProperty: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'When using email (or non-record id), set the unique property (e.g. "email" or "domain")',
    },
    limit: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Maximum number of results per page (max 100, default 100)',
    },
    after: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Pagination cursor for next page of results (from previous response)',
    },
    properties: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Comma-separated list of HubSpot property names to return (e.g., "email,firstname,lastname,phone")',
    },
    associations: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Comma-separated list of object types to retrieve associated IDs for (e.g., "companies,deals")',
    },
  },

  request: {
    url: (params) => {
      const trimmedId = params.contactId?.trim()
      if (trimmedId) {
        const baseUrl = `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(trimmedId)}`
        const queryParams = new URLSearchParams()
        if (params.idProperty) {
          queryParams.append('idProperty', params.idProperty)
        }
        if (params.properties) {
          queryParams.append('properties', params.properties)
        }
        if (params.associations) {
          queryParams.append('associations', params.associations)
        }
        const queryString = queryParams.toString()
        return queryString ? `${baseUrl}?${queryString}` : baseUrl
      }

      const baseUrl = 'https://api.hubapi.com/crm/v3/objects/contacts'
      const queryParams = new URLSearchParams()

      if (params.limit) {
        queryParams.append('limit', params.limit)
      }
      if (params.after) {
        queryParams.append('after', params.after)
      }
      if (params.properties) {
        queryParams.append('properties', params.properties)
      }
      if (params.associations) {
        queryParams.append('associations', params.associations)
      }

      const queryString = queryParams.toString()
      return queryString ? `${baseUrl}?${queryString}` : baseUrl
    },
    method: 'GET',
    headers: (params) => {
      if (!params.accessToken) {
        throw new Error('Access token is required')
      }

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
      throw new Error(data.message || 'Failed to list contacts from HubSpot')
    }

    // Single-record GET /contacts/{id} returns the object directly (no `results` array).
    if (!Array.isArray(data.results) && data.id != null) {
      return {
        success: true,
        output: {
          contacts: [data],
          paging: null,
          metadata: {
            totalReturned: 1,
            hasMore: false,
          },
          success: true,
        },
      }
    }

    return {
      success: true,
      output: {
        contacts: data.results || [],
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
    contacts: CONTACTS_ARRAY_OUTPUT,
    paging: PAGING_OUTPUT,
    metadata: METADATA_OUTPUT,
    success: { type: 'boolean', description: 'Operation success status' },
  },
}
