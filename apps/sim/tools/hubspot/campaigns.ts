import { createLogger } from '@/lib/logs/console/logger'
import type {
  HubSpotCampaignAsset,
  HubSpotCampaignMetrics,
  HubSpotCampaignRevenue,
  HubSpotCampaignSpend,
  HubSpotGetCampaignAssetsParams,
  HubSpotGetCampaignAssetsResponse,
  HubSpotGetCampaignBudgetItemParams,
  HubSpotGetCampaignBudgetItemResponse,
  HubSpotGetCampaignBudgetTotalsParams,
  HubSpotGetCampaignBudgetTotalsResponse,
  HubSpotGetCampaignContactsParams,
  HubSpotGetCampaignContactsResponse,
  HubSpotGetCampaignMetricsParams,
  HubSpotGetCampaignMetricsResponse,
  HubSpotGetCampaignParams,
  HubSpotGetCampaignResponse,
  HubSpotGetCampaignRevenueParams,
  HubSpotGetCampaignRevenueResponse,
  HubSpotGetCampaignSpendParams,
  HubSpotGetCampaignSpendResponse,
  HubSpotListCampaignsParams,
  HubSpotListCampaignsResponse,
} from '@/tools/hubspot/types'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('HubSpotCampaigns')

const buildHeaders = (accessToken: string) => {
  if (!accessToken) {
    throw new Error('Access token is required')
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

export const hubspotListCampaignsTool: ToolConfig<
  HubSpotListCampaignsParams,
  HubSpotListCampaignsResponse
> = {
  id: 'hubspot_list_campaigns',
  name: 'List HubSpot Campaigns',
  description: 'Retrieve marketing campaigns with pagination support',
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
    limit: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Maximum number of results per page',
    },
    after: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Pagination cursor for the next page',
    },
  },
  request: {
    url: (params) => {
      const baseUrl = 'https://api.hubapi.com/marketing/v3/campaigns/'
      const queryParams = new URLSearchParams()

      if (params.limit) {
        queryParams.append('limit', params.limit)
      }
      if (params.after) {
        queryParams.append('after', params.after)
      }

      const queryString = queryParams.toString()
      return queryString ? `${baseUrl}?${queryString}` : baseUrl
    },
    method: 'GET',
    headers: ({ accessToken }) => buildHeaders(accessToken),
  },
  transformResponse: async (response: Response) => {
    const data = await response.json()

    if (!response.ok) {
      logger.error('HubSpot list campaigns request failed', { data, status: response.status })
      throw new Error(data.message || 'Failed to list campaigns from HubSpot')
    }

    const campaigns = data.results || []

    return {
      success: true,
      output: {
        campaigns,
        total: data.total,
        paging: data.paging,
        metadata: {
          operation: 'list_campaigns' as const,
          totalReturned: campaigns.length,
          total: data.total,
        },
        success: true,
      },
    }
  },
  outputs: {
    success: { type: 'boolean', description: 'Operation success status' },
    output: {
      type: 'object',
      description: 'Campaign list response',
      properties: {
        campaigns: { type: 'array', description: 'Array of campaign objects' },
        total: { type: 'number', description: 'Total number of campaigns' },
        paging: { type: 'object', description: 'Pagination information' },
        metadata: { type: 'object', description: 'Operation metadata' },
        success: { type: 'boolean', description: 'Operation success status' },
      },
    },
  },
}

export const hubspotGetCampaignTool: ToolConfig<
  HubSpotGetCampaignParams,
  HubSpotGetCampaignResponse
> = {
  id: 'hubspot_get_campaign',
  name: 'Get HubSpot Campaign',
  description: 'Retrieve details for a specific marketing campaign',
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
    campaignGuid: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Campaign GUID to retrieve',
    },
  },
  request: {
    url: ({ campaignGuid }) =>
      `https://api.hubapi.com/marketing/v3/campaigns/${encodeURIComponent(campaignGuid)}`,
    method: 'GET',
    headers: ({ accessToken }) => buildHeaders(accessToken),
  },
  transformResponse: async (response: Response, params) => {
    const data = await response.json()

    if (!response.ok) {
      logger.error('HubSpot get campaign request failed', { data, status: response.status })
      throw new Error(data.message || 'Failed to retrieve campaign from HubSpot')
    }

    return {
      success: true,
      output: {
        campaign: data,
        metadata: {
          operation: 'get_campaign' as const,
          campaignGuid: params.campaignGuid,
        },
        success: true,
      },
    }
  },
  outputs: {
    success: { type: 'boolean', description: 'Operation success status' },
    output: {
      type: 'object',
      description: 'Campaign details',
      properties: {
        campaign: { type: 'object', description: 'Campaign object' },
        metadata: { type: 'object', description: 'Operation metadata' },
        success: { type: 'boolean', description: 'Operation success status' },
      },
    },
  },
}

export const hubspotGetCampaignSpendTool: ToolConfig<
  HubSpotGetCampaignSpendParams,
  HubSpotGetCampaignSpendResponse
> = {
  id: 'hubspot_get_campaign_spend',
  name: 'Get HubSpot Campaign Spend Item',
  description: 'Retrieve a specific spend item for a campaign',
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
    campaignGuid: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Campaign GUID',
    },
    spendId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Spend item ID',
    },
  },
  request: {
    url: ({ campaignGuid, spendId }) =>
      `https://api.hubapi.com/marketing/v3/campaigns/${encodeURIComponent(campaignGuid)}/spend/${encodeURIComponent(spendId)}`,
    method: 'GET',
    headers: ({ accessToken }) => buildHeaders(accessToken),
  },
  transformResponse: async (response: Response, params) => {
    const data: HubSpotCampaignSpend | { message?: string } = await response.json()

    if (!response.ok) {
      logger.error('HubSpot get campaign spend request failed', { data, status: response.status })
      throw new Error((data as { message?: string }).message || 'Failed to retrieve campaign spend')
    }

    return {
      success: true,
      output: {
        spend: data as HubSpotCampaignSpend,
        metadata: {
          operation: 'get_campaign_spend' as const,
          campaignGuid: params.campaignGuid,
          spendId: params.spendId,
        },
        success: true,
      },
    }
  },
  outputs: {
    success: { type: 'boolean', description: 'Operation success status' },
    output: {
      type: 'object',
      description: 'Spend item details',
      properties: {
        spend: { type: 'object', description: 'Spend item object' },
        metadata: { type: 'object', description: 'Operation metadata' },
        success: { type: 'boolean', description: 'Operation success status' },
      },
    },
  },
}

export const hubspotGetCampaignMetricsTool: ToolConfig<
  HubSpotGetCampaignMetricsParams,
  HubSpotGetCampaignMetricsResponse
> = {
  id: 'hubspot_get_campaign_metrics',
  name: 'Get HubSpot Campaign Metrics',
  description: 'Retrieve performance metrics for a campaign',
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
    campaignGuid: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Campaign GUID',
    },
  },
  request: {
    url: ({ campaignGuid }) =>
      `https://api.hubapi.com/marketing/v3/campaigns/${encodeURIComponent(campaignGuid)}/reports/metrics`,
    method: 'GET',
    headers: ({ accessToken }) => buildHeaders(accessToken),
  },
  transformResponse: async (response: Response, params) => {
    const data: HubSpotCampaignMetrics | { message?: string } = await response.json()

    if (!response.ok) {
      logger.error('HubSpot get campaign metrics request failed', { data, status: response.status })
      throw new Error((data as { message?: string }).message || 'Failed to retrieve campaign metrics')
    }

    return {
      success: true,
      output: {
        metrics: data as HubSpotCampaignMetrics,
        metadata: {
          operation: 'get_campaign_metrics' as const,
          campaignGuid: params.campaignGuid,
        },
        success: true,
      },
    }
  },
  outputs: {
    success: { type: 'boolean', description: 'Operation success status' },
    output: {
      type: 'object',
      description: 'Campaign metrics',
      properties: {
        metrics: { type: 'object', description: 'Metrics object' },
        metadata: { type: 'object', description: 'Operation metadata' },
        success: { type: 'boolean', description: 'Operation success status' },
      },
    },
  },
}

export const hubspotGetCampaignRevenueTool: ToolConfig<
  HubSpotGetCampaignRevenueParams,
  HubSpotGetCampaignRevenueResponse
> = {
  id: 'hubspot_get_campaign_revenue',
  name: 'Get HubSpot Campaign Revenue',
  description: 'Retrieve revenue reports for a campaign',
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
    campaignGuid: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Campaign GUID',
    },
  },
  request: {
    url: ({ campaignGuid }) =>
      `https://api.hubapi.com/marketing/v3/campaigns/${encodeURIComponent(campaignGuid)}/reports/revenue`,
    method: 'GET',
    headers: ({ accessToken }) => buildHeaders(accessToken),
  },
  transformResponse: async (response: Response, params) => {
    const data: HubSpotCampaignRevenue | { message?: string } = await response.json()

    if (!response.ok) {
      logger.error('HubSpot get campaign revenue request failed', { data, status: response.status })
      throw new Error((data as { message?: string }).message || 'Failed to retrieve campaign revenue')
    }

    return {
      success: true,
      output: {
        revenue: data as HubSpotCampaignRevenue,
        metadata: {
          operation: 'get_campaign_revenue' as const,
          campaignGuid: params.campaignGuid,
        },
        success: true,
      },
    }
  },
  outputs: {
    success: { type: 'boolean', description: 'Operation success status' },
    output: {
      type: 'object',
      description: 'Campaign revenue data',
      properties: {
        revenue: { type: 'object', description: 'Revenue object' },
        metadata: { type: 'object', description: 'Operation metadata' },
        success: { type: 'boolean', description: 'Operation success status' },
      },
    },
  },
}

export const hubspotGetCampaignContactsTool: ToolConfig<
  HubSpotGetCampaignContactsParams,
  HubSpotGetCampaignContactsResponse
> = {
  id: 'hubspot_get_campaign_contacts',
  name: 'Get HubSpot Campaign Contacts',
  description: 'Retrieve contacts tied to a campaign report',
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
    campaignGuid: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Campaign GUID',
    },
    contactType: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Contact type for the report (e.g., influenced, new)',
    },
    after: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Pagination cursor for the next page',
    },
  },
  request: {
    url: ({ campaignGuid, contactType, after }) => {
      const baseUrl = `https://api.hubapi.com/marketing/v3/campaigns/${encodeURIComponent(campaignGuid)}/reports/contacts/${encodeURIComponent(contactType)}`
      const queryParams = new URLSearchParams()

      if (after) {
        queryParams.append('after', after)
      }

      const queryString = queryParams.toString()
      return queryString ? `${baseUrl}?${queryString}` : baseUrl
    },
    method: 'GET',
    headers: ({ accessToken }) => buildHeaders(accessToken),
  },
  transformResponse: async (response: Response, params) => {
    const data: { results?: Array<{ id: string }>; paging?: Record<string, any>; message?: string } =
      await response.json()

    if (!response.ok) {
      logger.error('HubSpot get campaign contacts request failed', { data, status: response.status })
      throw new Error(data.message || 'Failed to retrieve campaign contacts')
    }

    const contacts = data.results || []

    return {
      success: true,
      output: {
        contacts,
        paging: data.paging,
        metadata: {
          operation: 'get_campaign_contacts' as const,
          campaignGuid: params.campaignGuid,
          contactType: params.contactType,
          totalReturned: contacts.length,
        },
        success: true,
      },
    }
  },
  outputs: {
    success: { type: 'boolean', description: 'Operation success status' },
    output: {
      type: 'object',
      description: 'Campaign contacts',
      properties: {
        contacts: { type: 'array', description: 'Array of contact records' },
        paging: { type: 'object', description: 'Pagination information' },
        metadata: { type: 'object', description: 'Operation metadata' },
        success: { type: 'boolean', description: 'Operation success status' },
      },
    },
  },
}

export const hubspotGetCampaignBudgetTotalsTool: ToolConfig<
  HubSpotGetCampaignBudgetTotalsParams,
  HubSpotGetCampaignBudgetTotalsResponse
> = {
  id: 'hubspot_get_campaign_budget_totals',
  name: 'Get HubSpot Campaign Budget Totals',
  description: 'Retrieve budget and spend totals for a campaign',
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
    campaignGuid: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Campaign GUID',
    },
  },
  request: {
    url: ({ campaignGuid }) =>
      `https://api.hubapi.com/marketing/v3/campaigns/${encodeURIComponent(campaignGuid)}/budget/totals`,
    method: 'GET',
    headers: ({ accessToken }) => buildHeaders(accessToken),
  },
  transformResponse: async (response: Response, params) => {
    const data:
      | {
          budgetItems?: HubSpotCampaignSpend[]
          currencyCode?: string
          spendItems?: HubSpotCampaignSpend[]
          budgetTotal?: number
          remainingBudget?: number
          spendTotal?: number
          message?: string
        }
      | { message?: string } = await response.json()

    if (!response.ok) {
      logger.error('HubSpot get campaign budget totals request failed', {
        data,
        status: response.status,
      })
      throw new Error((data as { message?: string }).message || 'Failed to retrieve budget totals')
    }

    return {
      success: true,
      output: {
        budgetTotals: data as HubSpotGetCampaignBudgetTotalsResponse['output']['budgetTotals'],
        metadata: {
          operation: 'get_campaign_budget_totals' as const,
          campaignGuid: params.campaignGuid,
        },
        success: true,
      },
    }
  },
  outputs: {
    success: { type: 'boolean', description: 'Operation success status' },
    output: {
      type: 'object',
      description: 'Budget totals',
      properties: {
        budgetTotals: { type: 'object', description: 'Budget and spend totals' },
        metadata: { type: 'object', description: 'Operation metadata' },
        success: { type: 'boolean', description: 'Operation success status' },
      },
    },
  },
}

export const hubspotGetCampaignBudgetItemTool: ToolConfig<
  HubSpotGetCampaignBudgetItemParams,
  HubSpotGetCampaignBudgetItemResponse
> = {
  id: 'hubspot_get_campaign_budget_item',
  name: 'Get HubSpot Campaign Budget Item',
  description: 'Retrieve a specific budget item for a campaign',
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
    campaignGuid: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Campaign GUID',
    },
    budgetId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Budget item ID',
    },
  },
  request: {
    url: ({ campaignGuid, budgetId }) =>
      `https://api.hubapi.com/marketing/v3/campaigns/${encodeURIComponent(campaignGuid)}/budget/${encodeURIComponent(budgetId)}`,
    method: 'GET',
    headers: ({ accessToken }) => buildHeaders(accessToken),
  },
  transformResponse: async (response: Response, params) => {
    const data: HubSpotCampaignSpend | { message?: string } = await response.json()

    if (!response.ok) {
      logger.error('HubSpot get campaign budget item request failed', { data, status: response.status })
      throw new Error((data as { message?: string }).message || 'Failed to retrieve budget item')
    }

    return {
      success: true,
      output: {
        budgetItem: data as HubSpotCampaignSpend,
        metadata: {
          operation: 'get_campaign_budget_item' as const,
          campaignGuid: params.campaignGuid,
          budgetId: params.budgetId,
        },
        success: true,
      },
    }
  },
  outputs: {
    success: { type: 'boolean', description: 'Operation success status' },
    output: {
      type: 'object',
      description: 'Budget item details',
      properties: {
        budgetItem: { type: 'object', description: 'Budget item object' },
        metadata: { type: 'object', description: 'Operation metadata' },
        success: { type: 'boolean', description: 'Operation success status' },
      },
    },
  },
}

export const hubspotGetCampaignAssetsTool: ToolConfig<
  HubSpotGetCampaignAssetsParams,
  HubSpotGetCampaignAssetsResponse
> = {
  id: 'hubspot_get_campaign_assets',
  name: 'Get HubSpot Campaign Assets',
  description: 'Retrieve assets associated with a campaign',
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
    campaignGuid: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Campaign GUID',
    },
    assetType: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Asset type to fetch',
    },
    after: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Pagination cursor for the next page',
    },
  },
  request: {
    url: ({ campaignGuid, assetType, after }) => {
      const baseUrl = `https://api.hubapi.com/marketing/v3/campaigns/${encodeURIComponent(campaignGuid)}/assets/${encodeURIComponent(assetType)}`
      const queryParams = new URLSearchParams()

      if (after) {
        queryParams.append('after', after)
      }

      const queryString = queryParams.toString()
      return queryString ? `${baseUrl}?${queryString}` : baseUrl
    },
    method: 'GET',
    headers: ({ accessToken }) => buildHeaders(accessToken),
  },
  transformResponse: async (response: Response, params) => {
    const data:
      | {
          results?: HubSpotCampaignAsset[]
          paging?: Record<string, any>
          message?: string
        }
      | { message?: string } = await response.json()

    if (!response.ok) {
      logger.error('HubSpot get campaign assets request failed', { data, status: response.status })
      throw new Error((data as { message?: string }).message || 'Failed to retrieve campaign assets')
    }

    const assets = (data as { results?: HubSpotCampaignAsset[] }).results || []

    return {
      success: true,
      output: {
        assets,
        paging: (data as { paging?: Record<string, any> }).paging,
        metadata: {
          operation: 'get_campaign_assets' as const,
          campaignGuid: params.campaignGuid,
          assetType: params.assetType,
          totalReturned: assets.length,
        },
        success: true,
      },
    }
  },
  outputs: {
    success: { type: 'boolean', description: 'Operation success status' },
    output: {
      type: 'object',
      description: 'Campaign assets',
      properties: {
        assets: { type: 'array', description: 'Array of assets' },
        paging: { type: 'object', description: 'Pagination information' },
        metadata: { type: 'object', description: 'Operation metadata' },
        success: { type: 'boolean', description: 'Operation success status' },
      },
    },
  },
}

