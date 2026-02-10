import type { OutputProperty, ToolResponse } from '@/tools/types'

/**
 * Shared output property definitions for HubSpot CRM responses.
 * Based on HubSpot CRM API v3 documentation.
 * @see https://developers.hubspot.com/docs/api/crm/contacts
 * @see https://developers.hubspot.com/docs/api/crm/companies
 * @see https://developers.hubspot.com/docs/api/crm/deals
 */

/**
 * Common contact properties returned by HubSpot API.
 * Default properties returned by search: createdate, email, firstname, hs_object_id, lastmodifieddate, lastname.
 * @see https://developers.hubspot.com/blog/a-developers-guide-to-hubspot-crm-objects-contacts-object
 */
export const CONTACT_PROPERTIES_OUTPUT = {
  email: { type: 'string', description: 'Contact email address' },
  firstname: { type: 'string', description: 'Contact first name' },
  lastname: { type: 'string', description: 'Contact last name' },
  phone: { type: 'string', description: 'Contact phone number' },
  mobilephone: { type: 'string', description: 'Contact mobile phone number' },
  company: { type: 'string', description: 'Associated company name' },
  website: { type: 'string', description: 'Contact website URL' },
  jobtitle: { type: 'string', description: 'Contact job title' },
  lifecyclestage: {
    type: 'string',
    description:
      'Lifecycle stage (subscriber, lead, marketingqualifiedlead, salesqualifiedlead, opportunity, customer)',
  },
  hubspot_owner_id: { type: 'string', description: 'HubSpot owner ID' },
  hs_object_id: { type: 'string', description: 'HubSpot object ID (same as record ID)' },
  createdate: { type: 'string', description: 'Contact creation date (ISO 8601)' },
  lastmodifieddate: { type: 'string', description: 'Last modified date (ISO 8601)' },
  address: { type: 'string', description: 'Street address' },
  city: { type: 'string', description: 'City' },
  state: { type: 'string', description: 'State/Region' },
  zip: { type: 'string', description: 'Postal/ZIP code' },
  country: { type: 'string', description: 'Country' },
  fax: { type: 'string', description: 'Fax number' },
  hs_timezone: { type: 'string', description: 'Contact timezone' },
} as const satisfies Record<string, OutputProperty>

/**
 * Common company properties returned by HubSpot API.
 * Default properties: name, domain, hs_object_id.
 * @see https://developers.hubspot.com/blog/a-developers-guide-to-hubspot-crm-objects-company-object
 * @see https://knowledge.hubspot.com/properties/hubspot-crm-default-company-properties
 */
export const COMPANY_PROPERTIES_OUTPUT = {
  name: { type: 'string', description: 'Company name' },
  domain: { type: 'string', description: 'Company website domain (unique identifier)' },
  description: { type: 'string', description: 'Company description' },
  industry: { type: 'string', description: 'Industry type (e.g., Airlines/Aviation)' },
  phone: { type: 'string', description: 'Company phone number' },
  city: { type: 'string', description: 'City' },
  state: { type: 'string', description: 'State/Region' },
  zip: { type: 'string', description: 'Postal/ZIP code' },
  country: { type: 'string', description: 'Country' },
  address: { type: 'string', description: 'Street address' },
  numberofemployees: { type: 'string', description: 'Total number of employees' },
  annualrevenue: { type: 'string', description: 'Annual revenue estimate' },
  lifecyclestage: { type: 'string', description: 'Lifecycle stage' },
  hubspot_owner_id: { type: 'string', description: 'HubSpot owner ID' },
  hs_object_id: { type: 'string', description: 'HubSpot object ID (same as record ID)' },
  hs_createdate: { type: 'string', description: 'Company creation date (ISO 8601)' },
  hs_lastmodifieddate: { type: 'string', description: 'Last modified date (ISO 8601)' },
  hs_additional_domains: {
    type: 'string',
    description: 'Additional domains (semicolon-separated)',
  },
  num_associated_contacts: {
    type: 'string',
    description: 'Number of associated contacts (auto-updated)',
  },
  num_associated_deals: {
    type: 'string',
    description: 'Number of associated deals (auto-updated)',
  },
  website: { type: 'string', description: 'Company website URL' },
} as const satisfies Record<string, OutputProperty>

/**
 * Common deal properties returned by HubSpot API.
 * Default properties: dealname, amount, closedate, pipeline, dealstage.
 * @see https://developers.hubspot.com/blog/a-developers-guide-to-hubspot-crm-objects-deals-object
 */
export const DEAL_PROPERTIES_OUTPUT = {
  dealname: { type: 'string', description: 'Deal name' },
  amount: { type: 'string', description: 'Deal amount' },
  dealstage: { type: 'string', description: 'Current deal stage' },
  pipeline: { type: 'string', description: 'Pipeline the deal is in' },
  closedate: { type: 'string', description: 'Expected close date (ISO 8601)' },
  dealtype: { type: 'string', description: 'Deal type (New Business, Existing Business, etc.)' },
  description: { type: 'string', description: 'Deal description' },
  hubspot_owner_id: { type: 'string', description: 'HubSpot owner ID' },
  hs_object_id: { type: 'string', description: 'HubSpot object ID (same as record ID)' },
  createdate: { type: 'string', description: 'Deal creation date (ISO 8601)' },
  hs_lastmodifieddate: { type: 'string', description: 'Last modified date (ISO 8601)' },
  num_associated_contacts: {
    type: 'string',
    description: 'Number of associated contacts',
  },
} as const satisfies Record<string, OutputProperty>

/**
 * Paging output properties for list endpoints.
 * @see https://developers.hubspot.com/docs/guides/crm/using-object-apis
 */
export const PAGING_OUTPUT_PROPERTIES = {
  after: { type: 'string', description: 'Cursor for next page of results' },
  link: { type: 'string', description: 'Link to next page', optional: true },
} as const satisfies Record<string, OutputProperty>

/**
 * Complete paging object output definition.
 */
export const PAGING_OUTPUT: OutputProperty = {
  type: 'object',
  description: 'Pagination information for fetching more results',
  optional: true,
  properties: {
    next: {
      type: 'object',
      description: 'Next page cursor information',
      optional: true,
      properties: PAGING_OUTPUT_PROPERTIES,
    },
  },
}

/**
 * Metadata output properties for list endpoints.
 */
export const METADATA_OUTPUT_PROPERTIES = {
  totalReturned: { type: 'number', description: 'Number of records returned in this response' },
  hasMore: { type: 'boolean', description: 'Whether more records are available' },
} as const satisfies Record<string, OutputProperty>

/**
 * Complete metadata object output definition.
 */
export const METADATA_OUTPUT: OutputProperty = {
  type: 'object',
  description: 'Response metadata',
  properties: METADATA_OUTPUT_PROPERTIES,
}

/**
 * Common CRM record base output properties (id, createdAt, updatedAt, archived).
 * All HubSpot CRM objects share this structure.
 */
export const CRM_RECORD_BASE_OUTPUT_PROPERTIES = {
  id: { type: 'string', description: 'Unique record ID (hs_object_id)' },
  createdAt: { type: 'string', description: 'Record creation timestamp (ISO 8601)' },
  updatedAt: { type: 'string', description: 'Record last updated timestamp (ISO 8601)' },
  archived: { type: 'boolean', description: 'Whether the record is archived' },
} as const satisfies Record<string, OutputProperty>

/**
 * Contact object output definition with nested properties.
 */
export const CONTACT_OBJECT_OUTPUT: OutputProperty = {
  type: 'object',
  description: 'HubSpot contact record',
  properties: {
    ...CRM_RECORD_BASE_OUTPUT_PROPERTIES,
    properties: {
      type: 'object',
      description: 'Contact properties',
      properties: CONTACT_PROPERTIES_OUTPUT,
    },
    associations: {
      type: 'object',
      description: 'Associated records (companies, deals, etc.)',
      optional: true,
    },
  },
}

/**
 * Company object output definition with nested properties.
 */
export const COMPANY_OBJECT_OUTPUT: OutputProperty = {
  type: 'object',
  description: 'HubSpot company record',
  properties: {
    ...CRM_RECORD_BASE_OUTPUT_PROPERTIES,
    properties: {
      type: 'object',
      description: 'Company properties',
      properties: COMPANY_PROPERTIES_OUTPUT,
    },
    associations: {
      type: 'object',
      description: 'Associated records (contacts, deals, etc.)',
      optional: true,
    },
  },
}

/**
 * Deal object output definition with nested properties.
 */
export const DEAL_OBJECT_OUTPUT: OutputProperty = {
  type: 'object',
  description: 'HubSpot deal record',
  properties: {
    ...CRM_RECORD_BASE_OUTPUT_PROPERTIES,
    properties: {
      type: 'object',
      description: 'Deal properties',
      properties: DEAL_PROPERTIES_OUTPUT,
    },
    associations: {
      type: 'object',
      description: 'Associated records (contacts, companies, line items, etc.)',
      optional: true,
    },
  },
}

/**
 * Contacts array output definition for list endpoints.
 */
export const CONTACTS_ARRAY_OUTPUT: OutputProperty = {
  type: 'array',
  description: 'Array of HubSpot contact records',
  items: {
    type: 'object',
    properties: {
      ...CRM_RECORD_BASE_OUTPUT_PROPERTIES,
      properties: {
        type: 'object',
        description: 'Contact properties',
        properties: CONTACT_PROPERTIES_OUTPUT,
      },
      associations: {
        type: 'object',
        description: 'Associated records',
        optional: true,
      },
    },
  },
}

/**
 * Companies array output definition for list endpoints.
 */
export const COMPANIES_ARRAY_OUTPUT: OutputProperty = {
  type: 'array',
  description: 'Array of HubSpot company records',
  items: {
    type: 'object',
    properties: {
      ...CRM_RECORD_BASE_OUTPUT_PROPERTIES,
      properties: {
        type: 'object',
        description: 'Company properties',
        properties: COMPANY_PROPERTIES_OUTPUT,
      },
      associations: {
        type: 'object',
        description: 'Associated records',
        optional: true,
      },
    },
  },
}

/**
 * Deals array output definition for list endpoints.
 */
export const DEALS_ARRAY_OUTPUT: OutputProperty = {
  type: 'array',
  description: 'Array of HubSpot deal records',
  items: {
    type: 'object',
    properties: {
      ...CRM_RECORD_BASE_OUTPUT_PROPERTIES,
      properties: {
        type: 'object',
        description: 'Deal properties',
        properties: DEAL_PROPERTIES_OUTPUT,
      },
      associations: {
        type: 'object',
        description: 'Associated records',
        optional: true,
      },
    },
  },
}

/**
 * User properties returned by HubSpot Settings API v3.
 * Note: firstName and lastName are NOT returned by the Settings API.
 * Use the Owners API if you need user names.
 * @see https://developers.hubspot.com/docs/reference/api/settings/users/user-provisioning
 */
export const USER_OUTPUT_PROPERTIES = {
  id: { type: 'string', description: 'User ID' },
  email: { type: 'string', description: 'User email address' },
  roleId: { type: 'string', description: 'User role ID', optional: true },
  primaryTeamId: { type: 'string', description: 'Primary team ID', optional: true },
  secondaryTeamIds: {
    type: 'array',
    description: 'Secondary team IDs',
    optional: true,
    items: { type: 'string', description: 'Team ID' },
  },
  superAdmin: { type: 'boolean', description: 'Whether user is a super admin', optional: true },
} as const satisfies Record<string, OutputProperty>

/**
 * Users array output definition for list endpoints.
 */
export const USERS_ARRAY_OUTPUT: OutputProperty = {
  type: 'array',
  description: 'Array of HubSpot user objects',
  items: {
    type: 'object',
    properties: USER_OUTPUT_PROPERTIES,
  },
}

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
    totalItems?: number
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
    contactId: string
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
    contactId: string
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
    contactId: string
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
  output: {
    contacts: HubSpotContact[]
    total: number
    paging?: HubSpotPaging
    metadata: {
      totalReturned: number
      hasMore: boolean
    }
    success: boolean
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
    companyId: string
    success: boolean
  }
}
export type HubSpotCreateCompanyParams = HubSpotCreateContactParams
export type HubSpotCreateCompanyResponse = Omit<HubSpotCreateContactResponse, 'output'> & {
  output: {
    company: HubSpotContact
    companyId: string
    success: boolean
  }
}
export type HubSpotUpdateCompanyParams = HubSpotUpdateContactParams & { companyId: string }
export type HubSpotUpdateCompanyResponse = Omit<HubSpotUpdateContactResponse, 'output'> & {
  output: {
    company: HubSpotContact
    companyId: string
    success: boolean
  }
}
export type HubSpotSearchCompaniesParams = HubSpotSearchContactsParams
export interface HubSpotSearchCompaniesResponse extends ToolResponse {
  output: {
    companies: HubSpotContact[]
    total: number
    paging?: HubSpotPaging
    metadata: {
      totalReturned: number
      hasMore: boolean
    }
    success: boolean
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

export interface HubSpotGetCampaignMetricsParams extends HubSpotGetCampaignParams {
  startDate?: string
  endDate?: string
}

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

export interface HubSpotGetCampaignRevenueParams extends HubSpotGetCampaignParams {
  startDate?: string
  endDate?: string
}

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

export type HubSpotEmailStatisticsInterval =
  | 'DAY'
  | 'HOUR'
  | 'MINUTE'
  | 'MONTH'
  | 'QUARTER'
  | 'QUARTER_HOUR'
  | 'SECOND'
  | 'WEEK'
  | 'YEAR'

export interface HubSpotGetEmailStatisticsHistogramParams {
  accessToken: string
  interval: HubSpotEmailStatisticsInterval
  emailIds?: number[]
  startTimestamp?: string
  endTimestamp?: string
}

export interface HubSpotEmailStatisticsCounters {
  bounce: number
  click: number
  contactslost: number
  delivered: number
  dropped: number
  hardbounced: number
  notsent: number
  open: number
  pending: number
  selected: number
  sent: number
  softbounced: number
  spamreport: number
  suppressed: number
  unsubscribed: number
}

export interface HubSpotEmailStatisticsDeviceBreakdown {
  click_device_type?: {
    computer: number
    mobile: number
    unknown: number
  }
  open_device_type?: {
    computer: number
    mobile: number
    unknown: number
  }
}

export interface HubSpotEmailStatisticsRatios {
  bounceratio: number
  clickratio: number
  clickthroughratio: number
  contactslostratio: number
  deliveredratio: number
  hardbounceratio: number
  notsentratio: number
  openratio: number
  pendingratio: number
  softbounceratio: number
  spamreportratio: number
  unsubscribedratio: number
}

export interface HubSpotEmailStatisticsTimeInterval {
  start: string
  end: string
}

export interface HubSpotEmailStatisticsResult {
  aggregateStatistic?: {
    counters: HubSpotEmailStatisticsCounters
    deviceBreakdown: HubSpotEmailStatisticsDeviceBreakdown
    qualifierStats: Record<string, any>
    ratios: HubSpotEmailStatisticsRatios
  }
  interval: HubSpotEmailStatisticsTimeInterval
}

export interface HubSpotEmailStatisticsHistogram {
  results: HubSpotEmailStatisticsResult[]
  total: number
}

export interface HubSpotGetEmailStatisticsHistogramResponse extends ToolResponse {
  output: {
    histogram: HubSpotEmailStatisticsHistogram
    metadata: {
      operation: 'get_email_statistics_histogram'
      interval: HubSpotEmailStatisticsInterval
      emailIds?: number[]
      startTimestamp?: string
      endTimestamp?: string
    }
    success: boolean
  }
}

export interface HubSpotGetEmailParams {
  accessToken: string
  emailId: string
}

export interface HubSpotGetEmailResponse extends ToolResponse {
  output: {
    email: Record<string, any> // The email object from HubSpot API
    metadata: {
      operation: 'get_email'
      emailId: string
    }
    success: boolean
  }
}

export interface HubSpotListEmailsParams {
  accessToken: string
  archived?: boolean
  createdAfter?: string
  createdBefore?: string
  workflowNames?: boolean
  includeStats?: boolean
  isPublished?: boolean
  limit?: number
  marketingCampaignNames?: boolean
}

export interface HubSpotListEmailsResponse extends ToolResponse {
  output: {
    emails: Record<string, any>[] // Array of email objects from HubSpot API
    paging?: Record<string, any> // Pagination information if available
    metadata: {
      operation: 'list_emails'
      totalReturned: number
      archived?: boolean
      createdAfter?: string
      createdBefore?: string
      isPublished?: boolean
      limit?: number
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
  | HubSpotGetEmailStatisticsHistogramResponse
  | HubSpotGetEmailResponse
  | HubSpotListEmailsResponse
