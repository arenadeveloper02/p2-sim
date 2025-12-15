import type { ToolResponse } from '@/tools/types'

// Common HubSpot types
export interface HubSpotUser {
  id: string
  email: string
  firstName?: string
  lastName?: string
  roleId?: string
  primaryTeamId?: string
  superAdmin?: boolean
}

export interface HubSpotContact {
  id: string
  properties: Record<string, any>
  createdAt: string
  updatedAt: string
  archived: boolean
  associations?: Record<string, any>
}

export interface HubSpotPaging {
  next?: {
    after: string
    link?: string
  }
}

// Users
export interface HubSpotGetUsersResponse extends ToolResponse {
  output: {
    users: HubSpotUser[]
    metadata: {
      operation: 'get_users'
      totalItems?: number
    }
    success: boolean
  }
}

export interface HubSpotGetUsersParams {
  accessToken: string
  limit?: string
}

// List Contacts
export interface HubSpotListContactsResponse extends ToolResponse {
  output: {
    contacts: HubSpotContact[]
    paging?: HubSpotPaging
    metadata: {
      operation: 'list_contacts'
      totalReturned: number
      hasMore: boolean
    }
    success: boolean
  }
}

export interface HubSpotListContactsParams {
  accessToken: string
  limit?: string
  after?: string
  properties?: string
  associations?: string
}

// Get Contact
export interface HubSpotGetContactResponse extends ToolResponse {
  output: {
    contact: HubSpotContact
    metadata: {
      operation: 'get_contact'
      contactId: string
    }
    success: boolean
  }
}

export interface HubSpotGetContactParams {
  accessToken: string
  contactId: string
  idProperty?: string
  properties?: string
  associations?: string
}

// Create Contact
export interface HubSpotCreateContactResponse extends ToolResponse {
  output: {
    contact: HubSpotContact
    metadata: {
      operation: 'create_contact'
      contactId: string
    }
    success: boolean
  }
}

export interface HubSpotCreateContactParams {
  accessToken: string
  properties: Record<string, any>
  associations?: Array<{
    to: { id: string }
    types: Array<{
      associationCategory: string
      associationTypeId: number
    }>
  }>
}

// Update Contact
export interface HubSpotUpdateContactResponse extends ToolResponse {
  output: {
    contact: HubSpotContact
    metadata: {
      operation: 'update_contact'
      contactId: string
    }
    success: boolean
  }
}

export interface HubSpotUpdateContactParams {
  accessToken: string
  contactId: string
  idProperty?: string
  properties: Record<string, any>
}

// Search Contacts
export interface HubSpotSearchContactsResponse extends ToolResponse {
  contacts: HubSpotContact[]
  total: number
  paging?: HubSpotPaging
  metadata: {
    operation: 'search_contacts'
    totalReturned: number
    total: number
  }
}

export interface HubSpotSearchContactsParams {
  accessToken: string
  filterGroups?: Array<{
    filters: Array<{
      propertyName: string
      operator: string
      value: string
    }>
  }>
  sorts?: Array<{
    propertyName: string
    direction: 'ASCENDING' | 'DESCENDING'
  }>
  query?: string
  properties?: string[]
  limit?: number
  after?: string
}

// Companies (same structure as contacts)
export type HubSpotCompany = HubSpotContact
export type HubSpotListCompaniesParams = HubSpotListContactsParams
export type HubSpotListCompaniesResponse = Omit<HubSpotListContactsResponse, 'output'> & {
  output: {
    companies: HubSpotContact[]
    paging?: HubSpotPaging
    metadata: {
      operation: 'list_companies'
      totalReturned: number
      hasMore: boolean
    }
    success: boolean
  }
}
export type HubSpotGetCompanyParams = HubSpotGetContactParams & { companyId: string }
export type HubSpotGetCompanyResponse = Omit<HubSpotGetContactResponse, 'output'> & {
  output: {
    company: HubSpotContact
    metadata: {
      operation: 'get_company'
      companyId: string
    }
    success: boolean
  }
}
export type HubSpotCreateCompanyParams = HubSpotCreateContactParams
export type HubSpotCreateCompanyResponse = Omit<HubSpotCreateContactResponse, 'output'> & {
  output: {
    company: HubSpotContact
    metadata: {
      operation: 'create_company'
      companyId: string
    }
    success: boolean
  }
}
export type HubSpotUpdateCompanyParams = HubSpotUpdateContactParams & { companyId: string }
export type HubSpotUpdateCompanyResponse = Omit<HubSpotUpdateContactResponse, 'output'> & {
  output: {
    company: HubSpotContact
    metadata: {
      operation: 'update_company'
      companyId: string
    }
    success: boolean
  }
}
export type HubSpotSearchCompaniesParams = HubSpotSearchContactsParams
export interface HubSpotSearchCompaniesResponse extends ToolResponse {
  companies: HubSpotContact[]
  total: number
  paging?: HubSpotPaging
  metadata: {
    operation: 'search_companies'
    totalReturned: number
    total: number
  }
}

// Deals (same structure as contacts)
export type HubSpotDeal = HubSpotContact
export type HubSpotListDealsParams = HubSpotListContactsParams
export type HubSpotListDealsResponse = Omit<HubSpotListContactsResponse, 'output'> & {
  output: {
    deals: HubSpotContact[]
    paging?: HubSpotPaging
    metadata: {
      operation: 'list_deals'
      totalReturned: number
      hasMore: boolean
    }
    success: boolean
  }
}

// Marketing campaigns
export interface HubSpotCampaign {
  id: string
  createdAt: string
  updatedAt: string
  properties: Record<string, any>
  businessUnits?: Array<{ id: string | number }>
  assets?: Record<string, any>
}

export interface HubSpotCampaignSpend {
  amount: number
  createdAt: number | string
  id: string
  name?: string
  order?: number
  updatedAt?: number | string
  description?: string
}

export interface HubSpotCampaignAsset {
  id: string
  metrics?: Record<string, any>
  name?: string
}

export interface HubSpotCampaignMetrics {
  influencedContacts?: number
  newContactsFirstTouch?: number
  newContactsLastTouch?: number
  sessions?: number
}

export interface HubSpotCampaignRevenue {
  contactsNumber?: number
  currencyCode?: string
  dealAmount?: number
  dealsNumber?: number
  revenueAmount?: number
}

export interface HubSpotListCampaignsParams {
  accessToken: string
  limit?: string
  after?: string
}

export interface HubSpotListCampaignsResponse extends ToolResponse {
  output: {
    campaigns: HubSpotCampaign[]
    total?: number
    paging?: HubSpotPaging
    metadata: {
      operation: 'list_campaigns'
      totalReturned: number
      total?: number
    }
    success: boolean
  }
}

export interface HubSpotGetCampaignParams {
  accessToken: string
  campaignGuid: string
}

export interface HubSpotGetCampaignResponse extends ToolResponse {
  output: {
    campaign: HubSpotCampaign
    metadata: {
      operation: 'get_campaign'
      campaignGuid: string
    }
    success: boolean
  }
}

export interface HubSpotGetCampaignSpendParams extends HubSpotGetCampaignParams {
  spendId: string
}

export interface HubSpotGetCampaignSpendResponse extends ToolResponse {
  output: {
    spend: HubSpotCampaignSpend
    metadata: {
      operation: 'get_campaign_spend'
      campaignGuid: string
      spendId: string
    }
    success: boolean
  }
}

export interface HubSpotGetCampaignMetricsParams extends HubSpotGetCampaignParams {}

export interface HubSpotGetCampaignMetricsResponse extends ToolResponse {
  output: {
    metrics: HubSpotCampaignMetrics
    metadata: {
      operation: 'get_campaign_metrics'
      campaignGuid: string
    }
    success: boolean
  }
}

export interface HubSpotGetCampaignRevenueParams extends HubSpotGetCampaignParams {}

export interface HubSpotGetCampaignRevenueResponse extends ToolResponse {
  output: {
    revenue: HubSpotCampaignRevenue
    metadata: {
      operation: 'get_campaign_revenue'
      campaignGuid: string
    }
    success: boolean
  }
}

export interface HubSpotGetCampaignContactsParams extends HubSpotGetCampaignParams {
  contactType: string
  after?: string
}

export interface HubSpotGetCampaignContactsResponse extends ToolResponse {
  output: {
    contacts: Array<{ id: string }>
    paging?: HubSpotPaging
    metadata: {
      operation: 'get_campaign_contacts'
      campaignGuid: string
      contactType: string
      totalReturned: number
    }
    success: boolean
  }
}

export interface HubSpotGetCampaignBudgetTotalsParams extends HubSpotGetCampaignParams {}

export interface HubSpotGetCampaignBudgetTotalsResponse extends ToolResponse {
  output: {
    budgetTotals: {
      budgetItems?: HubSpotCampaignSpend[]
      currencyCode?: string
      spendItems?: HubSpotCampaignSpend[]
      budgetTotal?: number
      remainingBudget?: number
      spendTotal?: number
    }
    metadata: {
      operation: 'get_campaign_budget_totals'
      campaignGuid: string
    }
    success: boolean
  }
}

export interface HubSpotGetCampaignBudgetItemParams extends HubSpotGetCampaignParams {
  budgetId: string
}

export interface HubSpotGetCampaignBudgetItemResponse extends ToolResponse {
  output: {
    budgetItem: HubSpotCampaignSpend
    metadata: {
      operation: 'get_campaign_budget_item'
      campaignGuid: string
      budgetId: string
    }
    success: boolean
  }
}

export interface HubSpotGetCampaignAssetsParams extends HubSpotGetCampaignParams {
  assetType: string
  after?: string
}

export interface HubSpotGetCampaignAssetsResponse extends ToolResponse {
  output: {
    assets: HubSpotCampaignAsset[]
    paging?: HubSpotPaging
    metadata: {
      operation: 'get_campaign_assets'
      campaignGuid: string
      assetType: string
      totalReturned: number
    }
    success: boolean
  }
}

// Generic HubSpot response type for the block
export type HubSpotResponse =
  | HubSpotGetUsersResponse
  | HubSpotListContactsResponse
  | HubSpotGetContactResponse
  | HubSpotCreateContactResponse
  | HubSpotUpdateContactResponse
  | HubSpotSearchContactsResponse
  | HubSpotListCompaniesResponse
  | HubSpotGetCompanyResponse
  | HubSpotCreateCompanyResponse
  | HubSpotUpdateCompanyResponse
  | HubSpotSearchCompaniesResponse
  | HubSpotListDealsResponse
  | HubSpotListCampaignsResponse
  | HubSpotGetCampaignResponse
  | HubSpotGetCampaignSpendResponse
  | HubSpotGetCampaignMetricsResponse
  | HubSpotGetCampaignRevenueResponse
  | HubSpotGetCampaignContactsResponse
  | HubSpotGetCampaignBudgetTotalsResponse
  | HubSpotGetCampaignBudgetItemResponse
  | HubSpotGetCampaignAssetsResponse
