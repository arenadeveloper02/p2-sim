import { createLogger } from '@sim/logger'
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

export const buildHeaders = (accessToken: string) => {
  if (!accessToken) {
    throw new Error('Access token is required')
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Service function to fetch campaigns list from HubSpot API
 * Uses the same logic as hubspotListCampaignsTool for consistency
 */
export async function fetchHubSpotCampaigns(
  accessToken: string,
  limit?: string
): Promise<Array<{ label: string; id: string }>> {
  const limitValue = limit || '100'
  const baseUrl = 'https://api.hubapi.com/marketing/v3/campaigns/'
  const queryParams = new URLSearchParams()

  if (limitValue) {
    queryParams.append('limit', limitValue)
  }
  queryParams.append('properties', 'hs_start_date,hs_end_date,hs_color_hex,hs_notes,hs_audience,hs_goal,hs_owner,hs_currency_code,hs_created_by_user_id,hs_campaign_status,hs_object_id,hs_name,hs_utm,hs_budget_items_sum_amount,hs_spend_items_sum_amount')
  
  const queryString = queryParams.toString()
  const url = queryString ? `${baseUrl}?${queryString}` : baseUrl

  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(accessToken),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    logger.error('HubSpot list campaigns request failed', { errorData, status: response.status })
    throw new Error(errorData.message || 'Failed to list campaigns from HubSpot')
  }

  const data = await response.json()
  const campaigns = data.results || []
  return campaigns.map((campaign: any) => {
    console.log('campaign values', campaign?.properties)
    
    const campaignName =
      campaign?.properties?.hs_name ||
      campaign?.id ||
      'Unnamed Campaign'
    return {
      label: String(campaignName),
      id: String(campaign?.id || ''),
    }
  })
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
      // if (params.after) {
      //   queryParams.append('after', params.after)
      // }
      queryParams.append('properties', 'hs_start_date,hs_end_date,hs_color_hex,hs_notes,hs_audience,hs_goal,hs_owner,hs_currency_code,hs_created_by_user_id,hs_campaign_status,hs_object_id,hs_name,hs_utm,hs_budget_items_sum_amount,hs_spend_items_sum_amount')
      const queryString = queryParams.toString()
      console.log('queryString', queryString)
      console.log('baseUrl', baseUrl)
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
  HubSpotGetCampaignMetricsParams & { campaignGuid?: string | string[] },
  HubSpotGetCampaignMetricsResponse
> = {
  id: 'hubspot_get_campaign_metrics',
  name: 'Get HubSpot Campaign Metrics',
  description: 'Retrieve performance metrics for a campaign or multiple campaigns',
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
      description: 'Campaign GUID or array of Campaign GUIDs',
    },
  },
  request: {
    url: ({ campaignGuid }) => {
      // Handle array case - use first campaign for URL (will be handled in transformResponse)
      const guid = Array.isArray(campaignGuid) ? campaignGuid[0] : campaignGuid
      return `https://api.hubapi.com/marketing/v3/campaigns/${encodeURIComponent(guid)}/reports/metrics`
    },
    method: 'GET',
    headers: ({ accessToken }) => buildHeaders(accessToken),
  },
  transformResponse: async (response: Response, params) => {
    if (!params) {
      throw new Error('Missing parameters')
    }

    // Handle multiple campaigns
    if (Array.isArray(params.campaignGuid) && params.campaignGuid.length > 1) {
      const campaignGuids = params.campaignGuid
      const metricsPromises = campaignGuids.map(async (guid) => {
        try {
          const url = `https://api.hubapi.com/marketing/v3/campaigns/${encodeURIComponent(guid)}/reports/metrics`
          const campaignResponse = await fetch(url, {
            method: 'GET',
            headers: buildHeaders(params.accessToken),
          })

          if (!campaignResponse.ok) {
            const errorData = await campaignResponse.json().catch(() => ({}))
            logger.error('HubSpot get campaign metrics request failed', {
              data: errorData,
              status: campaignResponse.status,
              campaignGuid: guid,
            })
            return {
              campaignGuid: guid,
              metrics: null,
              error: (errorData as { message?: string }).message || 'Failed to retrieve campaign metrics',
            }
          }

          const data = await campaignResponse.json()
          return {
            campaignGuid: guid,
            metrics: data as HubSpotCampaignMetrics,
            error: null,
          }
        } catch (error) {
          logger.error('Error fetching campaign metrics', { error, campaignGuid: guid })
          return {
            campaignGuid: guid,
            metrics: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      })

      const results = await Promise.all(metricsPromises)
      const successfulMetrics = results.filter((r) => r.metrics !== null)
      const failedMetrics = results.filter((r) => r.metrics === null)

      return {
        success: successfulMetrics.length > 0,
        output: {
          metrics: successfulMetrics.map((r) => ({
            campaignGuid: r.campaignGuid,
            metrics: r.metrics,
          })) as any, // Array of metrics for multiple campaigns
          errors: failedMetrics.length > 0 ? failedMetrics.map((r) => ({
            campaignGuid: r.campaignGuid,
            error: r.error,
          })) : undefined,
          metadata: {
            operation: 'get_campaign_metrics' as const,
            campaignGuids: campaignGuids,
            totalRequested: campaignGuids.length,
            totalSuccessful: successfulMetrics.length,
            totalFailed: failedMetrics.length,
          } as any,
          success: successfulMetrics.length > 0,
        },
      } as HubSpotGetCampaignMetricsResponse
    }

    // Handle single campaign (original behavior)
    const data: HubSpotCampaignMetrics | { message?: string } = await response.json()

    if (!response.ok) {
      logger.error('HubSpot get campaign metrics request failed', { data, status: response.status })
      throw new Error(
        (data as { message?: string }).message || 'Failed to retrieve campaign metrics'
      )
    }

    const campaignGuid = Array.isArray(params.campaignGuid) ? params.campaignGuid[0] : params.campaignGuid

    return {
      success: true,
      output: {
        metrics: data as HubSpotCampaignMetrics,
        metadata: {
          operation: 'get_campaign_metrics' as const,
          campaignGuid: campaignGuid,
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
        metrics: { type: 'object', description: 'Metrics object or array of metrics objects' },
        errors: { type: 'object', description: 'Array of errors for failed campaigns (if multiple)' },
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
      throw new Error(
        (data as { message?: string }).message || 'Failed to retrieve campaign revenue'
      )
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
    const data: {
      results?: Array<{ id: string }>
      paging?: Record<string, any>
      message?: string
    } = await response.json()

    if (!response.ok) {
      logger.error('HubSpot get campaign contacts request failed', {
        data,
        status: response.status,
      })
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
      logger.error('HubSpot get campaign budget item request failed', {
        data,
        status: response.status,
      })
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
      throw new Error(
        (data as { message?: string }).message || 'Failed to retrieve campaign assets'
      )
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
