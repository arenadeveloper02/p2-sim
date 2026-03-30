import { HubspotIcon } from '@/components/icons'
import { getScopesForService } from '@/lib/oauth/utils'
import type { BlockConfig } from '@/blocks/types'
import { AuthMode, IntegrationType } from '@/blocks/types'
import type { HubSpotResponse } from '@/tools/hubspot/types'
import { getTrigger } from '@/triggers'
import { hubspotAllTriggerOptions } from '@/triggers/hubspot/utils'

// Cache to prevent multiple API calls for the same credential
const campaignCache = new Map<
  string,
  { data: Array<{ label: string; id: string }>; timestamp: number }
>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
// Track in-flight requests to deduplicate concurrent calls
const campaignInFlightRequests = new Map<string, Promise<Array<{ label: string; id: string }>>>()

const fetchCampaignOptions = async (
  blockId: string
): Promise<Array<{ label: string; id: string }>> => {
  try {
    const { useSubBlockStore } = await import('@/stores/workflows/subblock/store')
    const { useWorkflowRegistry } = await import('@/stores/workflows/registry/store')

    const activeWorkflowId = useWorkflowRegistry.getState().activeWorkflowId
    if (!activeWorkflowId) {
      return []
    }

    const workflowValues = useSubBlockStore.getState().workflowValues[activeWorkflowId]
    const blockValues = workflowValues?.[blockId]

    const accounts = blockValues?.accounts
    const credential = blockValues?.credential

    const useSharedAccount = accounts && accounts !== 'manual'
    const credentialId = (useSharedAccount ? accounts : credential) as string

    if (!credentialId) {
      return []
    }

    // Check cache first
    const cached = campaignCache.get(credentialId)
    const now = Date.now()
    if (cached && now - cached.timestamp < CACHE_TTL) {
      return cached.data
    }

    // Check if there's already a request in flight for this credential
    const inFlightRequest = campaignInFlightRequests.get(credentialId)
    if (inFlightRequest) {
      return inFlightRequest
    }

    // Create a new request and track it
    const requestPromise = (async () => {
      try {
        // Fetch campaigns from server-side API which uses fetchHubSpotCampaigns internally
        // This avoids CORS issues since the API call happens on the server
        const response = await fetch(
          `/api/auth/oauth/hubspot/campaigns?credentialId=${encodeURIComponent(
            credentialId
          )}&limit=100`
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}) as any)
          throw new Error(
            (errorData as { error?: string }).error || 'Failed to fetch campaigns from HubSpot'
          )
        }

        const data = await response.json()
        // The API route uses fetchHubSpotCampaigns internally and returns the campaigns
        const options = (data.campaigns || []) as Array<{ label: string; id: string }>

        // Cache the results
        campaignCache.set(credentialId, { data: options, timestamp: now })

        return options
      } catch (error) {
        // Try to return cached data on error
        if (cached) {
          return cached.data
        }
        return []
      } finally {
        // Remove from in-flight requests when done
        campaignInFlightRequests.delete(credentialId)
      }
    })()

    // Store the in-flight request
    campaignInFlightRequests.set(credentialId, requestPromise)

    return requestPromise
  } catch (error) {
    // Try to return cached data on error
    try {
      const { useSubBlockStore } = await import('@/stores/workflows/subblock/store')
      const { useWorkflowRegistry } = await import('@/stores/workflows/registry/store')
      const activeWorkflowId = useWorkflowRegistry.getState().activeWorkflowId
      if (activeWorkflowId) {
        const workflowValues = useSubBlockStore.getState().workflowValues[activeWorkflowId]
        const blockValues = workflowValues?.[blockId]
        const accounts = blockValues?.accounts
        const credential = blockValues?.credential
        const useSharedAccount = accounts && accounts !== 'manual'
        const credentialId = (useSharedAccount ? accounts : credential) as string

        if (credentialId) {
          const cached = campaignCache.get(credentialId)
          if (cached) {
            return cached.data
          }
        }
      }
    } catch {
      // Ignore errors in error handler
    }
    // Always return an array, even on error
    return []
  }
}

const validateCampaignValue = (params: Record<string, any>, isMulti: boolean): string => {
  // No validation logic - just return undefined to let the system handle the value
  return undefined as unknown as string
}

export const HubSpotBlock: BlockConfig<HubSpotResponse> = {
  type: 'hubspot',
  name: 'HubSpot',
  description: 'Interact with HubSpot CRM or trigger workflows from HubSpot events',
  authMode: AuthMode.OAuth,
  longDescription:
    'Integrate HubSpot into your workflow. Manage contacts, companies, deals, tickets, and other CRM objects with powerful automation capabilities. Can be used in trigger mode to start workflows when contacts are created, deleted, or updated.',
  docsLink: 'https://docs.sim.ai/tools/hubspot',
  category: 'tools',
  integrationType: IntegrationType.CRM,
  tags: ['marketing', 'sales-engagement', 'customer-support'],
  bgColor: '#FF7A59',
  icon: HubspotIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Get Contacts', id: 'get_contacts' },
        { label: 'Create Contact', id: 'create_contact' },
        { label: 'Update Contact', id: 'update_contact' },
        { label: 'Search Contacts', id: 'search_contacts' },
        { label: 'Get Companies', id: 'get_companies' },
        { label: 'Create Company', id: 'create_company' },
        { label: 'Update Company', id: 'update_company' },
        { label: 'Search Companies', id: 'search_companies' },
        { label: 'Get Deals', id: 'get_deals' },
        { label: 'List Campaigns', id: 'list_campaigns' },
        { label: 'Get Campaign', id: 'get_campaign' },
        { label: 'Get Campaign Spend', id: 'get_campaign_spend' },
        { label: 'Get Campaign Metrics', id: 'get_campaign_metrics' },
        { label: 'Get Campaign Revenue', id: 'get_campaign_revenue' },
        { label: 'Get Campaign Contacts', id: 'get_campaign_contacts' },
        { label: 'Get Campaign Budget Totals', id: 'get_campaign_budget_totals' },
        { label: 'Get Campaign Budget Item', id: 'get_campaign_budget_item' },
        { label: 'Get Campaign Assets', id: 'get_campaign_assets' },
        { label: 'Get Email Statistics Histogram', id: 'get_email_statistics_histogram' },
        // { label: 'Get Email', id: 'get_email' },
        { label: 'Marketing Emails', id: 'list_emails' },
        { label: 'List CRM Objects', id: 'list_objects' },
        { label: 'Get CRM Object', id: 'get_object' },
        { label: 'List Association Types', id: 'list_association_types' },
        { label: 'List Associations', id: 'list_associations' },
        { label: 'Get Commerce Payments', id: 'get_commerce_payments' },
        { label: 'Get Subscriptions', id: 'get_subscriptions' },
        { label: 'List Imports', id: 'list_imports' },
        { label: 'Get Import', id: 'get_import' },
        { label: 'List Pipelines', id: 'list_pipelines' },
        { label: 'Get Pipeline', id: 'get_pipeline' },
        { label: 'List Properties', id: 'list_properties' },
        { label: 'Get Property', id: 'get_property' },
        { label: 'Create Deal', id: 'create_deal' },
        { label: 'Update Deal', id: 'update_deal' },
        { label: 'Search Deals', id: 'search_deals' },
        { label: 'Get Tickets', id: 'get_tickets' },
        { label: 'Create Ticket', id: 'create_ticket' },
        { label: 'Update Ticket', id: 'update_ticket' },
        { label: 'Search Tickets', id: 'search_tickets' },
        { label: 'Get Line Items', id: 'get_line_items' },
        { label: 'Create Line Item', id: 'create_line_item' },
        { label: 'Update Line Item', id: 'update_line_item' },
        { label: 'Get Quotes', id: 'get_quotes' },
        { label: 'Get Appointments', id: 'get_appointments' },
        { label: 'Create Appointment', id: 'create_appointment' },
        { label: 'Update Appointment', id: 'update_appointment' },
        { label: 'Get Carts', id: 'get_carts' },
        { label: 'List Owners', id: 'list_owners' },
        { label: 'Get Marketing Events', id: 'get_marketing_events' },
        { label: 'Get Lists', id: 'get_lists' },
        { label: 'Create List', id: 'create_list' },
        { label: 'Get Users', id: 'get_users' },
      ],
      value: () => 'get_contacts',
    },
    {
      id: 'accounts',
      title: 'Accounts',
      type: 'dropdown',
      options: [
        { label: 'Position2', id: 'position2' },
        { label: 'Northstar Anesthesia', id: 'northstar_anesthesia' },
        { label: 'Covalent Metrology', id: 'covalent_metrology' },
      ],
      value: () => 'northstar_anesthesia',
    },
    {
      id: 'credential',
      title: 'HubSpot Account',
      type: 'oauth-input',
      canonicalParamId: 'oauthCredential',
      mode: 'basic',
      serviceId: 'hubspot',
      requiredScopes: getScopesForService('hubspot'),
      placeholder: 'Select HubSpot account',
      required: true,
      hidden: true,
    },
    {
      id: 'manualCredential',
      title: 'HubSpot Account',
      type: 'short-input',
      canonicalParamId: 'oauthCredential',
      mode: 'advanced',
      placeholder: 'Enter credential ID',
      required: true,
    },
    {
      id: 'contactId',
      title: 'Contact ID or Email',
      type: 'short-input',
      placeholder: 'Leave empty to list all contacts',
      condition: { field: 'operation', value: 'get_contacts' },
    },
    {
      id: 'contactId',
      title: 'Contact ID or Email',
      type: 'short-input',
      placeholder: 'Numeric ID, or email (requires ID Property below)',
      condition: { field: 'operation', value: 'update_contact' },
      required: true,
    },
    {
      id: 'companyId',
      title: 'Company ID or Domain',
      type: 'short-input',
      placeholder: 'Leave empty to list all companies',
      condition: { field: 'operation', value: 'get_companies' },
    },
    {
      id: 'companyId',
      title: 'Company ID or Domain',
      type: 'short-input',
      placeholder: 'Numeric ID, or domain (requires ID Property below)',
      condition: { field: 'operation', value: 'update_company' },
      required: true,
    },
    {
      id: 'campaignGuid',
      title: 'Campaign',
      type: 'dropdown',
      placeholder: 'Select a campaign...',
      options: [], // Fallback empty array to prevent undefined errors
      dependsOn: { any: ['credential', 'accounts'] },
      multiSelect: false,
      condition: {
        field: 'operation',
        value: [
          'get_campaign',
          'get_campaign_contacts',
          'get_campaign_budget_totals',
          'get_campaign_budget_item',
          'get_campaign_assets',
        ],
      },
      fetchOptions: fetchCampaignOptions,
      value: (params) => validateCampaignValue(params, false),
    },
    {
      id: 'campaignGuids',
      title: 'Campaigns',
      type: 'dropdown',
      placeholder: 'Select campaigns...',
      options: [], // Fallback empty array to prevent undefined errors
      dependsOn: { any: ['credential', 'accounts'] },
      multiSelect: true,
      selectAllOption: true,
      condition: {
        field: 'operation',
        value: ['get_campaign_metrics', 'get_campaign_revenue', 'get_campaign_spend'],
      },
      fetchOptions: fetchCampaignOptions,
      value: (params) => validateCampaignValue(params, true),
    },
    {
      id: 'spendId',
      title: 'Spend ID',
      type: 'short-input',
      placeholder: 'Required to fetch a specific spend item',
      condition: { field: 'operation', value: ['get_campaign_spend'] },
    },
    {
      id: 'budgetId',
      title: 'Budget ID',
      type: 'short-input',
      placeholder: 'Required to fetch a specific budget item',
      condition: { field: 'operation', value: ['get_campaign_budget_item'] },
    },
    {
      id: 'startDate',
      title: 'Start Date',
      type: 'short-input',
      placeholder: 'YYYY-MM-DD',
      condition: { field: 'operation', value: ['get_campaign_revenue'] },
      required: true,
    },
    {
      id: 'endDate',
      title: 'End Date',
      type: 'short-input',
      placeholder: 'YYYY-MM-DD',
      condition: { field: 'operation', value: ['get_campaign_revenue'] },
      required: true,
    },
    {
      id: 'contactType',
      title: 'Contact Type',
      type: 'short-input',
      placeholder: 'e.g., influenced, new-first-touch, new-last-touch',
      condition: { field: 'operation', value: ['get_campaign_contacts'] },
    },
    {
      id: 'assetType',
      title: 'Asset Type',
      type: 'dropdown',
      options: [
        { label: 'Ad Campaign', id: 'AD_CAMPAIGN' },
        { label: 'Automation Platform Flow', id: 'AUTOMATION_PLATFORM_FLOW' },
        { label: 'Blog Post', id: 'BLOG_POST' },
        { label: 'Social Broadcast', id: 'SOCIAL_BROADCAST' },
        { label: 'Web Interactive', id: 'WEB_INTERACTIVE' },
        { label: 'CTA', id: 'CTA' },
        { label: 'External Web URL', id: 'EXTERNAL_WEB_URL' },
        { label: 'Form', id: 'FORM' },
        { label: 'Landing Page', id: 'LANDING_PAGE' },
        { label: 'Marketing Email', id: 'MARKETING_EMAIL' },
        { label: 'Marketing Event', id: 'MARKETING_EVENT' },
        { label: 'Marketing SMS', id: 'MARKETING_SMS' },
        { label: 'Object List', id: 'OBJECT_LIST' },
        { label: 'Site Page', id: 'SITE_PAGE' },
        { label: 'Sequence', id: 'SEQUENCE' },
        { label: 'Feedback Survey', id: 'FEEDBACK_SURVEY' },
        { label: 'Meeting Event', id: 'MEETING_EVENT' },
        { label: 'Email', id: 'EMAIL' },
        { label: 'Call', id: 'CALL' },
        { label: 'Playbook', id: 'PLAYBOOK' },
        { label: 'Sales Document', id: 'SALES_DOCUMENT' },
        { label: 'Podcast Episode', id: 'PODCAST_EPISODE' },
        { label: 'Case Study', id: 'CASE_STUDY' },
        { label: 'Knowledge Article', id: 'KNOWLEDGE_ARTICLE' },
      ],
      condition: { field: 'operation', value: ['get_campaign_assets'] },
      required: true,
    },
    {
      id: 'interval',
      title: 'Interval',
      type: 'dropdown',
      options: [
        { label: 'Day', id: 'DAY' },
        { label: 'Hour', id: 'HOUR' },
        { label: 'Minute', id: 'MINUTE' },
        { label: 'Month', id: 'MONTH' },
        { label: 'Quarter', id: 'QUARTER' },
        { label: 'Quarter Hour', id: 'QUARTER_HOUR' },
        { label: 'Second', id: 'SECOND' },
        { label: 'Week', id: 'WEEK' },
        { label: 'Year', id: 'YEAR' },
      ],
      value: () => 'DAY',
      condition: { field: 'operation', value: ['get_email_statistics_histogram'] },
      required: true,
    },
    {
      id: 'emailIds',
      title: 'Email IDs',
      type: 'short-input',
      placeholder: 'Comma-separated email IDs (numbers only, e.g., 1,2,3)',
      condition: { field: 'operation', value: ['get_email_statistics_histogram'] },
    },
    {
      id: 'startTimestamp',
      title: 'Start Timestamp',
      type: 'short-input',
      placeholder: 'Start timestamp in ISO8601 format (e.g., 2024-01-01T00:00:00Z)',
      condition: { field: 'operation', value: ['get_email_statistics_histogram'] },
    },
    {
      id: 'endTimestamp',
      title: 'End Timestamp',
      type: 'short-input',
      placeholder: 'End timestamp in ISO8601 format (e.g., 2024-12-31T23:59:59Z)',
      condition: { field: 'operation', value: ['get_email_statistics_histogram'] },
    },
    {
      id: 'emailId',
      title: 'Email ID',
      type: 'short-input',
      placeholder: 'Email ID (e.g., 282331989693)',
      condition: { field: 'operation', value: ['get_email'] },
      required: true,
    },
    {
      id: 'archived',
      title: 'Archived',
      type: 'dropdown',
      options: [
        { label: 'False', id: 'false' },
        { label: 'True', id: 'true' },
      ],
      value: () => 'true',
      condition: { field: 'operation', value: ['list_emails'] },
    },
    {
      id: 'createdAfter',
      title: 'Created After',
      type: 'short-input',
      placeholder: 'ISO8601 date (e.g., 2025-12-01)',
      condition: { field: 'operation', value: ['list_emails'] },
    },
    {
      id: 'createdBefore',
      title: 'Created Before',
      type: 'short-input',
      placeholder: 'ISO8601 date (e.g., 2025-12-31)',
      condition: { field: 'operation', value: ['list_emails'] },
    },
    {
      id: 'workflowNames',
      title: 'Include Workflow Names',
      type: 'dropdown',
      options: [
        { label: 'False', id: 'false' },
        { label: 'True', id: 'true' },
      ],
      value: () => 'true',
      condition: { field: 'operation', value: ['list_emails'] },
    },
    {
      id: 'includeStats',
      title: 'Include Stats',
      type: 'dropdown',
      options: [
        { label: 'False', id: 'false' },
        { label: 'True', id: 'true' },
      ],
      value: () => 'true',
      condition: { field: 'operation', value: ['list_emails'] },
    },
    {
      id: 'isPublished',
      title: 'Is Published',
      type: 'dropdown',
      options: [
        { label: 'False', id: 'false' },
        { label: 'True', id: 'true' },
      ],
      value: () => 'true',
      condition: { field: 'operation', value: ['list_emails'] },
    },
    {
      id: 'limit',
      title: 'Limit',
      type: 'short-input',
      placeholder: 'Maximum results (default: 10)',
      condition: { field: 'operation', value: ['list_emails'] },
    },
    {
      id: 'marketingCampaignNames',
      title: 'Include Marketing Campaign Names',
      type: 'dropdown',
      options: [
        { label: 'False', id: 'false' },
        { label: 'True', id: 'true' },
      ],
      value: () => 'true',
      condition: { field: 'operation', value: ['list_emails'] },
    },
    {
      id: 'objectType',
      title: 'Object Type',
      type: 'short-input',
      placeholder: 'e.g. appointments, companies, contacts, deals, tickets, carts',
      condition: { field: 'operation', value: 'list_objects' },
      required: true,
    },
    {
      id: 'objectType',
      title: 'Object Type',
      type: 'short-input',
      placeholder: 'e.g. appointments, 0-410 (courses), 0-3 (deals), discounts',
      condition: { field: 'operation', value: 'get_object' },
      required: true,
    },
    {
      id: 'objectId',
      title: 'Object ID',
      type: 'short-input',
      placeholder: 'ID of the CRM object to retrieve',
      condition: { field: 'operation', value: 'get_object' },
      required: true,
    },
    {
      id: 'fromObjectType',
      title: 'From Object Type',
      type: 'short-input',
      placeholder: 'e.g. contacts, companies',
      condition: { field: 'operation', value: 'list_association_types' },
      required: true,
    },
    {
      id: 'toObjectType',
      title: 'To Object Type',
      type: 'short-input',
      placeholder: 'e.g. companies, contacts, deals',
      condition: { field: 'operation', value: 'list_association_types' },
      required: true,
    },
    {
      id: 'objectType',
      title: 'Object Type',
      type: 'short-input',
      placeholder: 'e.g. contacts, companies',
      condition: { field: 'operation', value: 'list_associations' },
      required: true,
    },
    {
      id: 'objectId',
      title: 'Object ID',
      type: 'short-input',
      placeholder: 'ID of the source CRM object',
      condition: { field: 'operation', value: 'list_associations' },
      required: true,
    },
    {
      id: 'toObjectType',
      title: 'To Object Type',
      type: 'short-input',
      placeholder: 'e.g. companies, deals',
      condition: { field: 'operation', value: 'list_associations' },
      required: true,
    },
    {
      id: 'dealId',
      title: 'Deal ID',
      type: 'short-input',
      placeholder: 'Leave empty to list all deals',
      condition: { field: 'operation', value: 'get_deals' },
    },
    {
      id: 'dealId',
      title: 'Deal ID',
      type: 'short-input',
      placeholder: 'Numeric ID, or custom ID (requires ID Property below)',
      condition: { field: 'operation', value: 'update_deal' },
      required: true,
    },
    {
      id: 'ticketId',
      title: 'Ticket ID',
      type: 'short-input',
      placeholder: 'Leave empty to list all tickets',
      condition: { field: 'operation', value: 'get_tickets' },
    },
    {
      id: 'ticketId',
      title: 'Ticket ID',
      type: 'short-input',
      placeholder: 'Numeric ID, or custom ID (requires ID Property below)',
      condition: { field: 'operation', value: 'update_ticket' },
      required: true,
    },
    {
      id: 'lineItemId',
      title: 'Line Item ID',
      type: 'short-input',
      placeholder: 'Leave empty to list all line items',
      condition: { field: 'operation', value: 'get_line_items' },
    },
    {
      id: 'lineItemId',
      title: 'Line Item ID',
      type: 'short-input',
      placeholder: 'Numeric ID, or custom ID (requires ID Property below)',
      condition: { field: 'operation', value: 'update_line_item' },
      required: true,
    },
    {
      id: 'quoteId',
      title: 'Quote ID',
      type: 'short-input',
      placeholder: 'Leave empty to list all quotes',
      condition: { field: 'operation', value: 'get_quotes' },
    },
    {
      id: 'appointmentId',
      title: 'Appointment ID',
      type: 'short-input',
      placeholder: 'Leave empty to list all appointments',
      condition: { field: 'operation', value: 'get_appointments' },
    },
    {
      id: 'appointmentId',
      title: 'Appointment ID',
      type: 'short-input',
      placeholder: 'Numeric ID, or custom ID (requires ID Property below)',
      condition: { field: 'operation', value: 'update_appointment' },
      required: true,
    },
    {
      id: 'cartId',
      title: 'Cart ID',
      type: 'short-input',
      placeholder: 'Leave empty to list all carts',
      condition: { field: 'operation', value: 'get_carts' },
    },
    {
      id: 'commercePaymentId',
      title: 'Commerce Payment ID',
      type: 'short-input',
      placeholder: 'Leave empty to list all commerce payments',
      condition: { field: 'operation', value: 'get_commerce_payments' },
    },
    {
      id: 'subscriptionId',
      title: 'Subscription ID',
      type: 'short-input',
      placeholder: 'Leave empty to list all subscriptions',
      condition: { field: 'operation', value: 'get_subscriptions' },
    },
    {
      id: 'importId',
      title: 'Import ID',
      type: 'short-input',
      placeholder: 'ID of the CRM import to retrieve',
      condition: { field: 'operation', value: 'get_import' },
      required: true,
    },
    {
      id: 'objectType',
      title: 'Object Type',
      type: 'short-input',
      placeholder: 'e.g. deals, tickets',
      condition: { field: 'operation', value: ['list_pipelines', 'get_pipeline'] },
      required: true,
    },
    {
      id: 'pipelineId',
      title: 'Pipeline ID',
      type: 'short-input',
      placeholder: 'ID of the pipeline to retrieve',
      condition: { field: 'operation', value: 'get_pipeline' },
      required: true,
    },
    {
      id: 'objectType',
      title: 'Object Type',
      type: 'short-input',
      placeholder: 'e.g. contacts, companies, deals',
      condition: { field: 'operation', value: ['list_properties', 'get_property'] },
      required: true,
    },
    {
      id: 'propertyName',
      title: 'Property Name',
      type: 'short-input',
      placeholder: 'Internal property name (e.g. email, firstname)',
      condition: { field: 'operation', value: 'get_property' },
      required: true,
    },
    {
      id: 'dataSensitivity',
      title: 'Data Sensitivity',
      type: 'short-input',
      placeholder: 'e.g. non_sensitive (optional)',
      condition: { field: 'operation', value: ['list_properties', 'get_property'] },
    },
    {
      id: 'eventId',
      title: 'Marketing Event ID',
      type: 'short-input',
      placeholder: 'Leave empty to list all marketing events',
      condition: { field: 'operation', value: 'get_marketing_events' },
    },
    {
      id: 'listId',
      title: 'List ID',
      type: 'short-input',
      placeholder: 'Leave empty to search all lists',
      condition: { field: 'operation', value: 'get_lists' },
    },
    {
      id: 'listName',
      title: 'List Name',
      type: 'short-input',
      placeholder: 'Name for the new list',
      condition: { field: 'operation', value: 'create_list' },
      required: true,
    },
    {
      id: 'objectTypeId',
      title: 'Object Type ID',
      type: 'short-input',
      placeholder: 'e.g., "0-1" for contacts, "0-2" for companies',
      condition: { field: 'operation', value: 'create_list' },
      required: true,
    },
    {
      id: 'processingType',
      title: 'Processing Type',
      type: 'dropdown',
      options: [
        { label: 'Manual (Static)', id: 'MANUAL' },
        { label: 'Dynamic (Active)', id: 'DYNAMIC' },
      ],
      condition: { field: 'operation', value: 'create_list' },
      required: true,
    },
    {
      id: 'idProperty',
      title: 'ID Property',
      type: 'short-input',
      placeholder: 'Required if using email/domain (e.g., "email" or "domain")',
      condition: {
        field: 'operation',
        value: [
          'get_contacts',
          'update_contact',
          'get_companies',
          'update_company',
          'get_object',
          'get_deals',
          'update_deal',
          'get_tickets',
          'update_ticket',
          'get_line_items',
          'update_line_item',
          'get_quotes',
          'get_appointments',
          'update_appointment',
        ],
      },
    },
    {
      id: 'propertiesToSet',
      title: 'Properties',
      type: 'long-input',
      placeholder:
        'JSON object with properties (e.g., {"email": "test@example.com", "firstname": "John"})',
      condition: {
        field: 'operation',
        value: [
          'create_contact',
          'update_contact',
          'create_company',
          'update_company',
          'create_deal',
          'update_deal',
          'create_ticket',
          'update_ticket',
          'create_line_item',
          'update_line_item',
          'create_appointment',
          'update_appointment',
        ],
      },
      wandConfig: {
        enabled: true,
        maintainHistory: true,
        prompt: `You are an expert HubSpot CRM developer. Generate HubSpot property objects as JSON based on the user's request.

### CONTEXT
{context}

### CRITICAL INSTRUCTION
Return ONLY the JSON object with HubSpot properties. Do not include any explanations, markdown formatting, comments, or additional text. Just the raw JSON object that can be used directly in HubSpot API create/update operations.

### HUBSPOT PROPERTIES STRUCTURE
HubSpot properties are defined as a flat JSON object with property names as keys and their values as the corresponding values. Property names must match HubSpot's internal property names (usually lowercase, snake_case or no spaces).

### COMMON CONTACT PROPERTIES
**Standard Properties**:
- **email**: Email address (required for most operations)
- **firstname**: First name
- **lastname**: Last name
- **phone**: Phone number
- **mobilephone**: Mobile phone number
- **company**: Company name
- **jobtitle**: Job title
- **website**: Website URL
- **address**: Street address
- **city**: City
- **state**: State/Region
- **zip**: Postal code
- **country**: Country
- **lifecyclestage**: Lifecycle stage (e.g., "lead", "customer", "subscriber", "opportunity")
- **hs_lead_status**: Lead status (e.g., "NEW", "OPEN", "IN_PROGRESS", "QUALIFIED")

**Additional Properties**:
- **salutation**: Salutation (e.g., "Mr.", "Ms.", "Dr.")
- **degree**: Degree
- **industry**: Industry
- **fax**: Fax number
- **numemployees**: Number of employees (for companies)
- **annualrevenue**: Annual revenue (for companies)

### COMMON COMPANY PROPERTIES
**Standard Properties**:
- **name**: Company name (required)
- **domain**: Company domain (e.g., "example.com")
- **city**: City
- **state**: State/Region
- **zip**: Postal code
- **country**: Country
- **phone**: Phone number
- **industry**: Industry
- **type**: Company type (e.g., "PROSPECT", "PARTNER", "RESELLER", "VENDOR", "OTHER")
- **description**: Company description
- **website**: Website URL
- **numberofemployees**: Number of employees
- **annualrevenue**: Annual revenue

**Additional Properties**:
- **timezone**: Timezone
- **linkedin_company_page**: LinkedIn URL
- **twitterhandle**: Twitter handle
- **facebook_company_page**: Facebook URL
- **founded_year**: Year founded

### EXAMPLES

**Simple Contact**: "Create contact with email john@example.com and name John Doe"
→ {
  "email": "john@example.com",
  "firstname": "John",
  "lastname": "Doe"
}

**Complete Contact**: "Create a lead contact with full details"
→ {
  "email": "jane.smith@acme.com",
  "firstname": "Jane",
  "lastname": "Smith",
  "phone": "+1-555-123-4567",
  "company": "Acme Corp",
  "jobtitle": "Marketing Manager",
  "website": "https://acme.com",
  "city": "San Francisco",
  "state": "California",
  "country": "United States",
  "lifecyclestage": "lead",
  "hs_lead_status": "NEW"
}

**Simple Company**: "Create company Acme Corp with domain acme.com"
→ {
  "name": "Acme Corp",
  "domain": "acme.com"
}

**Complete Company**: "Create a technology company with full details"
→ {
  "name": "TechStart Inc",
  "domain": "techstart.io",
  "industry": "TECHNOLOGY",
  "phone": "+1-555-987-6543",
  "city": "Austin",
  "state": "Texas",
  "country": "United States",
  "website": "https://techstart.io",
  "description": "Innovative software solutions",
  "numberofemployees": 50,
  "annualrevenue": 5000000,
  "type": "PROSPECT"
}

**Update Contact**: "Update contact phone and job title"
→ {
  "phone": "+1-555-999-8888",
  "jobtitle": "Senior Manager"
}

### REMEMBER
Return ONLY the JSON object with properties - no explanations, no markdown, no extra text.`,
        placeholder: 'Describe the properties you want to set...',
        generationType: 'json-object',
      },
    },
    {
      id: 'properties',
      title: 'Properties to Return',
      type: 'short-input',
      placeholder: 'Comma-separated list (e.g., "email,firstname,lastname")',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: [
          'get_contacts',
          'get_companies',
          'get_deals',
          'list_objects',
          'get_object',
          'get_commerce_payments',
          'get_subscriptions',
          'get_tickets',
          'get_line_items',
          'get_quotes',
          'get_appointments',
          'get_carts',
        ],
      },
    },
    {
      id: 'associations',
      title: 'Associations',
      type: 'short-input',
      placeholder: 'Comma-separated object types (e.g., "companies,deals")',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: [
          'get_contacts',
          'get_companies',
          'get_deals',
          'list_objects',
          'get_object',
          'get_commerce_payments',
          'get_subscriptions',
          'get_tickets',
          'get_line_items',
          'get_quotes',
          'get_appointments',
          'get_carts',
          'create_contact',
          'create_company',
          'create_deal',
          'create_ticket',
          'create_line_item',
          'create_appointment',
        ],
      },
    },
    {
      id: 'limit',
      title: 'Results Per Page',
      type: 'short-input',
      placeholder: 'Max results (list: 100, search: 200)',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: [
          'get_users',
          'get_contacts',
          'get_companies',
          'get_deals',
          'get_tickets',
          'get_line_items',
          'get_quotes',
          'get_appointments',
          'get_carts',
          'list_owners',
          'get_marketing_events',
          'get_lists',
          'search_contacts',
          'search_companies',
          'list_campaigns',
          'list_objects',
          'list_associations',
          'list_carts',
          'list_commerce_payments',
          'list_subscriptions',
          'list_imports',
          'search_deals',
          'search_tickets',
        ],
      },
    },
    {
      id: 'after',
      title: 'Pagination Cursor',
      type: 'short-input',
      placeholder: 'Cursor from previous response paging.next.after',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: [
          'get_contacts',
          'get_companies',
          'get_deals',
          'get_tickets',
          'get_line_items',
          'get_quotes',
          'get_appointments',
          'get_carts',
          'list_owners',
          'get_users',
          'get_marketing_events',
          'get_lists',
          'search_contacts',
          'search_companies',
          'list_campaigns',
          'get_campaign_contacts',
          'get_campaign_assets',
          'list_objects',
          'list_associations',
          'list_carts',
          'list_commerce_payments',
          'list_subscriptions',
          'list_imports',
          'search_deals',
          'search_tickets',
        ],
      },
    },
    {
      id: 'query',
      title: 'Search Query',
      type: 'short-input',
      placeholder: 'Search term (e.g., company name, contact email)',
      condition: {
        field: 'operation',
        value: [
          'search_contacts',
          'search_companies',
          'search_deals',
          'search_tickets',
          'get_lists',
        ],
      },
    },
    {
      id: 'filterGroups',
      title: 'Filter Groups',
      type: 'long-input',
      placeholder:
        'JSON array of filter groups (e.g., [{"filters":[{"propertyName":"email","operator":"EQ","value":"test@example.com"}]}])',
      condition: {
        field: 'operation',
        value: ['search_contacts', 'search_companies', 'search_deals', 'search_tickets'],
      },
      wandConfig: {
        enabled: true,
        maintainHistory: true,
        prompt: `You are an expert HubSpot CRM developer. Generate HubSpot filter groups as JSON arrays based on the user's request.

### CONTEXT
{context}

### CRITICAL INSTRUCTION
Return ONLY the JSON array of filter groups. Do not include any explanations, markdown formatting, comments, or additional text. Just the raw JSON array that can be used directly in HubSpot API search operations.

### HUBSPOT FILTER GROUPS STRUCTURE
Filter groups are arrays of filter objects. Each filter group contains an array of filters. Multiple filter groups are combined with OR logic, while filters within a group are combined with AND logic.

Structure:
[
  {
    "filters": [
      {
        "propertyName": "property_name",
        "operator": "OPERATOR",
        "value": "value"
      }
    ]
  }
]

### FILTER OPERATORS
HubSpot supports the following operators:

**Comparison Operators**:
- **EQ**: Equals - exact match
- **NEQ**: Not equals
- **LT**: Less than (for numbers and dates)
- **LTE**: Less than or equal to
- **GT**: Greater than (for numbers and dates)
- **GTE**: Greater than or equal to
- **BETWEEN**: Between two values (requires "highValue" field)

**String Operators**:
- **CONTAINS_TOKEN**: Contains the token (word)
- **NOT_CONTAINS_TOKEN**: Does not contain the token

**Existence Operators**:
- **HAS_PROPERTY**: Property has any value (value can be "*")
- **NOT_HAS_PROPERTY**: Property has no value (value can be "*")

**Set Operators**:
- **IN**: Value is in the provided list (value is semicolon-separated)
- **NOT_IN**: Value is not in the provided list

### COMMON CONTACT PROPERTIES FOR FILTERING
- **email**: Email address
- **firstname**: First name
- **lastname**: Last name
- **lifecyclestage**: Lifecycle stage (lead, customer, subscriber, opportunity)
- **hs_lead_status**: Lead status (NEW, OPEN, IN_PROGRESS, QUALIFIED)
- **createdate**: Creation date (milliseconds timestamp)
- **lastmodifieddate**: Last modified date
- **phone**: Phone number
- **company**: Company name
- **jobtitle**: Job title

### COMMON COMPANY PROPERTIES FOR FILTERING
- **name**: Company name
- **domain**: Company domain
- **industry**: Industry
- **type**: Company type
- **city**: City
- **state**: State
- **country**: Country
- **numberofemployees**: Number of employees
- **annualrevenue**: Annual revenue
- **createdate**: Creation date

### EXAMPLES

**Simple Equality**: "Find contacts with email john@example.com"
→ [
  {
    "filters": [
      {
        "propertyName": "email",
        "operator": "EQ",
        "value": "john@example.com"
      }
    ]
  }
]

**Multiple Filters (AND)**: "Find lead contacts in San Francisco"
→ [
  {
    "filters": [
      {
        "propertyName": "lifecyclestage",
        "operator": "EQ",
        "value": "lead"
      },
      {
        "propertyName": "city",
        "operator": "EQ",
        "value": "San Francisco"
      }
    ]
  }
]

**Multiple Filter Groups (OR)**: "Find contacts who are either leads or customers"
→ [
  {
    "filters": [
      {
        "propertyName": "lifecyclestage",
        "operator": "EQ",
        "value": "lead"
      }
    ]
  },
  {
    "filters": [
      {
        "propertyName": "lifecyclestage",
        "operator": "EQ",
        "value": "customer"
      }
    ]
  }
]

**Contains Text**: "Find contacts with Gmail addresses"
→ [
  {
    "filters": [
      {
        "propertyName": "email",
        "operator": "CONTAINS_TOKEN",
        "value": "@gmail.com"
      }
    ]
  }
]

**IN Operator**: "Find companies in tech or finance industries"
→ [
  {
    "filters": [
      {
        "propertyName": "industry",
        "operator": "IN",
        "value": "TECHNOLOGY;FINANCE"
      }
    ]
  }
]

**Has Property**: "Find contacts with phone numbers"
→ [
  {
    "filters": [
      {
        "propertyName": "phone",
        "operator": "HAS_PROPERTY",
        "value": "*"
      }
    ]
  }
]

**Range Filter**: "Find companies with 10 to 100 employees"
→ [
  {
    "filters": [
      {
        "propertyName": "numberofemployees",
        "operator": "GTE",
        "value": "10"
      },
      {
        "propertyName": "numberofemployees",
        "operator": "LTE",
        "value": "100"
      }
    ]
  }
]

### REMEMBER
Return ONLY the JSON array of filter groups - no explanations, no markdown, no extra text.`,
        placeholder: 'Describe the filters you want to apply...',
        generationType: 'json-object',
      },
    },
    {
      id: 'sorts',
      title: 'Sort Order',
      type: 'long-input',
      placeholder:
        'JSON array of sort objects (e.g., [{"propertyName":"createdate","direction":"DESCENDING"}])',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: ['search_contacts', 'search_companies', 'search_deals', 'search_tickets'],
      },
      wandConfig: {
        enabled: true,
        maintainHistory: true,
        prompt: `You are an expert HubSpot CRM developer. Generate HubSpot sort arrays as JSON based on the user's request.

### CONTEXT
{context}

### CRITICAL INSTRUCTION
Return ONLY the JSON array of sort objects. Do not include any explanations, markdown formatting, comments, or additional text. Just the raw JSON array that can be used directly in HubSpot API search operations.

### HUBSPOT SORT STRUCTURE
Sorts are defined as an array of objects, each containing a property name and a direction. Results will be sorted by the first sort object, then by the second if values are equal, and so on.

Structure:
[
  {
    "propertyName": "property_name",
    "direction": "ASCENDING" | "DESCENDING"
  }
]

### SORT DIRECTIONS
- **ASCENDING**: Sort from lowest to highest (A-Z, 0-9, oldest to newest)
- **DESCENDING**: Sort from highest to lowest (Z-A, 9-0, newest to oldest)

### COMMON SORTABLE PROPERTIES

**Contact Properties**:
- **createdate**: Creation date (when the contact was created)
- **lastmodifieddate**: Last modified date (when the contact was last updated)
- **firstname**: First name (alphabetical)
- **lastname**: Last name (alphabetical)
- **email**: Email address (alphabetical)
- **lifecyclestage**: Lifecycle stage
- **hs_lead_status**: Lead status
- **company**: Company name (alphabetical)
- **jobtitle**: Job title (alphabetical)
- **phone**: Phone number

**Company Properties**:
- **createdate**: Creation date
- **lastmodifieddate**: Last modified date
- **name**: Company name (alphabetical)
- **domain**: Domain (alphabetical)
- **industry**: Industry
- **city**: City (alphabetical)
- **state**: State (alphabetical)
- **numberofemployees**: Number of employees (numeric)
- **annualrevenue**: Annual revenue (numeric)

### EXAMPLES

**Simple Sort**: "Sort by creation date, newest first"
→ [
  {
    "propertyName": "createdate",
    "direction": "DESCENDING"
  }
]

**Alphabetical Sort**: "Sort contacts by last name A to Z"
→ [
  {
    "propertyName": "lastname",
    "direction": "ASCENDING"
  }
]

**Multiple Sorts**: "Sort by lifecycle stage, then by last name"
→ [
  {
    "propertyName": "lifecyclestage",
    "direction": "ASCENDING"
  },
  {
    "propertyName": "lastname",
    "direction": "ASCENDING"
  }
]

**Numeric Sort**: "Sort companies by revenue, highest first"
→ [
  {
    "propertyName": "annualrevenue",
    "direction": "DESCENDING"
  }
]

**Recent First**: "Show most recently updated contacts first"
→ [
  {
    "propertyName": "lastmodifieddate",
    "direction": "DESCENDING"
  }
]

**Name and Date**: "Sort by company name, then by creation date newest first"
→ [
  {
    "propertyName": "name",
    "direction": "ASCENDING"
  },
  {
    "propertyName": "createdate",
    "direction": "DESCENDING"
  }
]

### REMEMBER
Return ONLY the JSON array of sort objects - no explanations, no markdown, no extra text.`,
        placeholder: 'Describe how you want to sort the results...',
        generationType: 'json-object',
      },
    },
    {
      id: 'searchProperties',
      title: 'Properties to Return',
      type: 'long-input',
      placeholder: 'JSON array of properties (e.g., ["email","firstname","lastname"])',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: ['search_contacts', 'search_companies', 'search_deals', 'search_tickets'],
      },
      wandConfig: {
        enabled: true,
        maintainHistory: true,
        prompt: `You are an expert HubSpot CRM developer. Generate HubSpot property arrays as JSON based on the user's request.

### CONTEXT
{context}

### CRITICAL INSTRUCTION
Return ONLY the JSON array of property names. Do not include any explanations, markdown formatting, comments, or additional text. Just the raw JSON array of strings that can be used directly in HubSpot API search operations.

### HUBSPOT PROPERTIES ARRAY STRUCTURE
Properties to return are defined as a simple array of property name strings. These specify which fields should be included in the search results.

Structure:
["property1", "property2", "property3"]

### COMMON CONTACT PROPERTIES

**Basic Information**:
- **email**: Email address
- **firstname**: First name
- **lastname**: Last name
- **phone**: Phone number
- **mobilephone**: Mobile phone number

**Professional Information**:
- **company**: Company name
- **jobtitle**: Job title
- **industry**: Industry
- **department**: Department
- **seniority**: Seniority level

**Address Information**:
- **address**: Street address
- **city**: City
- **state**: State/Region
- **zip**: Postal code
- **country**: Country

**CRM Information**:
- **lifecyclestage**: Lifecycle stage
- **hs_lead_status**: Lead status
- **hubspot_owner_id**: Owner ID
- **hs_analytics_source**: Original source

**Dates**:
- **createdate**: Creation date
- **lastmodifieddate**: Last modified date
- **hs_lifecyclestage_lead_date**: Lead date
- **hs_lifecyclestage_customer_date**: Customer date

**Website & Social**:
- **website**: Website URL
- **linkedin_url**: LinkedIn profile URL
- **twitterhandle**: Twitter handle

### COMMON COMPANY PROPERTIES

**Basic Information**:
- **name**: Company name
- **domain**: Company domain
- **phone**: Phone number
- **industry**: Industry
- **type**: Company type

**Address Information**:
- **city**: City
- **state**: State/Region
- **zip**: Postal code
- **country**: Country
- **address**: Street address

**Business Information**:
- **numberofemployees**: Number of employees
- **annualrevenue**: Annual revenue
- **founded_year**: Year founded
- **description**: Company description

**Website & Social**:
- **website**: Website URL
- **linkedin_company_page**: LinkedIn company page
- **twitterhandle**: Twitter handle
- **facebook_company_page**: Facebook page

**CRM Information**:
- **hubspot_owner_id**: Owner ID
- **createdate**: Creation date
- **lastmodifieddate**: Last modified date
- **hs_lastmodifieddate**: Last modified date (detailed)

### EXAMPLES

**Basic Contact Fields**: "Return email, name, and phone"
→ ["email", "firstname", "lastname", "phone"]

**Complete Contact Profile**: "Return all contact details"
→ ["email", "firstname", "lastname", "phone", "mobilephone", "company", "jobtitle", "address", "city", "state", "zip", "country", "lifecyclestage", "hs_lead_status", "createdate"]

**Business Contact Info**: "Return professional information"
→ ["email", "firstname", "lastname", "company", "jobtitle", "phone", "industry"]

**Basic Company Fields**: "Return company name, domain, and industry"
→ ["name", "domain", "industry"]

**Complete Company Profile**: "Return all company information"
→ ["name", "domain", "industry", "phone", "city", "state", "country", "numberofemployees", "annualrevenue", "website", "description", "type", "createdate"]

**Contact with Dates**: "Return contact info with timestamps"
→ ["email", "firstname", "lastname", "createdate", "lastmodifieddate", "lifecyclestage"]

**Company Financial Info**: "Return company size and revenue"
→ ["name", "domain", "numberofemployees", "annualrevenue", "industry"]

**Social Media Properties**: "Return social media links"
→ ["email", "firstname", "lastname", "linkedin_url", "twitterhandle"]

**CRM Status Fields**: "Return lifecycle and owner information"
→ ["email", "firstname", "lastname", "lifecyclestage", "hs_lead_status", "hubspot_owner_id"]

### REMEMBER
Return ONLY the JSON array of property names - no explanations, no markdown, no extra text.`,
        placeholder: 'Describe which properties you want to return...',
        generationType: 'json-object',
      },
    },
    {
      id: 'selectedTriggerId',
      title: 'Trigger Type',
      type: 'dropdown',
      mode: 'trigger',
      options: hubspotAllTriggerOptions,
      value: () => 'hubspot_contact_created',
      required: true,
    },
    ...getTrigger('hubspot_contact_created').subBlocks.slice(1),
    ...getTrigger('hubspot_contact_deleted').subBlocks.slice(1),
    ...getTrigger('hubspot_contact_privacy_deleted').subBlocks.slice(1),
    ...getTrigger('hubspot_contact_property_changed').subBlocks.slice(1),
    ...getTrigger('hubspot_company_created').subBlocks.slice(1),
    ...getTrigger('hubspot_company_deleted').subBlocks.slice(1),
    ...getTrigger('hubspot_company_property_changed').subBlocks.slice(1),
    ...getTrigger('hubspot_conversation_creation').subBlocks.slice(1),
    ...getTrigger('hubspot_conversation_deletion').subBlocks.slice(1),
    ...getTrigger('hubspot_conversation_new_message').subBlocks.slice(1),
    ...getTrigger('hubspot_conversation_privacy_deletion').subBlocks.slice(1),
    ...getTrigger('hubspot_conversation_property_changed').subBlocks.slice(1),
    ...getTrigger('hubspot_deal_created').subBlocks.slice(1),
    ...getTrigger('hubspot_deal_deleted').subBlocks.slice(1),
    ...getTrigger('hubspot_deal_property_changed').subBlocks.slice(1),
    ...getTrigger('hubspot_ticket_created').subBlocks.slice(1),
    ...getTrigger('hubspot_ticket_deleted').subBlocks.slice(1),
    ...getTrigger('hubspot_ticket_property_changed').subBlocks.slice(1),
  ],
  tools: {
    access: [
      'hubspot_get_users',
      'hubspot_list_contacts',
      'hubspot_get_contact',
      'hubspot_create_contact',
      'hubspot_update_contact',
      'hubspot_search_contacts',
      'hubspot_list_companies',
      'hubspot_get_company',
      'hubspot_create_company',
      'hubspot_update_company',
      'hubspot_search_companies',
      'hubspot_list_deals',
      'hubspot_list_campaigns',
      'hubspot_get_campaign',
      'hubspot_get_campaign_spend',
      'hubspot_get_campaign_metrics',
      'hubspot_get_campaign_revenue',
      'hubspot_get_campaign_contacts',
      'hubspot_get_campaign_budget_totals',
      'hubspot_get_campaign_budget_item',
      'hubspot_get_campaign_assets',
      'hubspot_get_email_statistics_histogram',
      'hubspot_get_email',
      'hubspot_list_emails',
      'hubspot_list_objects',
      'hubspot_get_object',
      'hubspot_list_association_types',
      'hubspot_list_associations',
      'hubspot_list_carts',
      'hubspot_get_cart',
      'hubspot_list_commerce_payments',
      'hubspot_get_commerce_payment',
      'hubspot_list_subscriptions',
      'hubspot_get_subscription',
      'hubspot_list_imports',
      'hubspot_get_import',
      'hubspot_list_pipelines',
      'hubspot_get_pipeline',
      'hubspot_list_properties',
      'hubspot_get_property',
      'hubspot_get_deal',
      'hubspot_create_deal',
      'hubspot_update_deal',
      'hubspot_search_deals',
      'hubspot_list_tickets',
      'hubspot_get_ticket',
      'hubspot_create_ticket',
      'hubspot_update_ticket',
      'hubspot_search_tickets',
      'hubspot_list_line_items',
      'hubspot_get_line_item',
      'hubspot_create_line_item',
      'hubspot_update_line_item',
      'hubspot_list_quotes',
      'hubspot_get_quote',
      'hubspot_list_appointments',
      'hubspot_get_appointment',
      'hubspot_create_appointment',
      'hubspot_update_appointment',
      'hubspot_list_owners',
      'hubspot_list_marketing_events',
      'hubspot_get_marketing_event',
      'hubspot_list_lists',
      'hubspot_get_list',
      'hubspot_create_list',
    ],
    config: {
      tool: (params) => {
        switch (params.operation) {
          case 'get_users':
            return 'hubspot_get_users'
          case 'get_contacts':
            return params.contactId ? 'hubspot_get_contact' : 'hubspot_list_contacts'
          case 'create_contact':
            return 'hubspot_create_contact'
          case 'update_contact':
            return 'hubspot_update_contact'
          case 'search_contacts':
            return 'hubspot_search_contacts'
          case 'get_companies':
            return params.companyId ? 'hubspot_get_company' : 'hubspot_list_companies'
          case 'create_company':
            return 'hubspot_create_company'
          case 'update_company':
            return 'hubspot_update_company'
          case 'search_companies':
            return 'hubspot_search_companies'
          case 'get_deals':
            return params.dealId ? 'hubspot_get_deal' : 'hubspot_list_deals'
          case 'list_campaigns':
            return 'hubspot_list_campaigns'
          case 'get_campaign':
            return 'hubspot_get_campaign'
          case 'get_campaign_spend':
            return 'hubspot_get_campaign_spend'
          case 'get_campaign_metrics':
            return 'hubspot_get_campaign_metrics'
          case 'get_campaign_revenue':
            return 'hubspot_get_campaign_revenue'
          case 'get_campaign_contacts':
            return 'hubspot_get_campaign_contacts'
          case 'get_campaign_budget_totals':
            return 'hubspot_get_campaign_budget_totals'
          case 'get_campaign_budget_item':
            return 'hubspot_get_campaign_budget_item'
          case 'get_campaign_assets':
            return 'hubspot_get_campaign_assets'
          case 'get_email_statistics_histogram':
            return 'hubspot_get_email_statistics_histogram'
          case 'get_email':
            return 'hubspot_get_email'
          case 'list_emails':
            return 'hubspot_list_emails'
          case 'list_objects':
            return 'hubspot_list_objects'
          case 'get_object':
            return 'hubspot_get_object'
          case 'list_association_types':
            return 'hubspot_list_association_types'
          case 'list_associations':
            return 'hubspot_list_associations'
          case 'get_commerce_payments':
            return params.commercePaymentId
              ? 'hubspot_get_commerce_payment'
              : 'hubspot_list_commerce_payments'
          case 'get_subscriptions':
            return params.subscriptionId ? 'hubspot_get_subscription' : 'hubspot_list_subscriptions'
          case 'list_imports':
            return 'hubspot_list_imports'
          case 'get_import':
            return 'hubspot_get_import'
          case 'list_pipelines':
            return 'hubspot_list_pipelines'
          case 'get_pipeline':
            return 'hubspot_get_pipeline'
          case 'list_properties':
            return 'hubspot_list_properties'
          case 'get_property':
            return 'hubspot_get_property'
          case 'create_deal':
            return 'hubspot_create_deal'
          case 'update_deal':
            return 'hubspot_update_deal'
          case 'search_deals':
            return 'hubspot_search_deals'
          case 'get_tickets':
            return params.ticketId ? 'hubspot_get_ticket' : 'hubspot_list_tickets'
          case 'create_ticket':
            return 'hubspot_create_ticket'
          case 'update_ticket':
            return 'hubspot_update_ticket'
          case 'search_tickets':
            return 'hubspot_search_tickets'
          case 'get_line_items':
            return params.lineItemId ? 'hubspot_get_line_item' : 'hubspot_list_line_items'
          case 'create_line_item':
            return 'hubspot_create_line_item'
          case 'update_line_item':
            return 'hubspot_update_line_item'
          case 'get_quotes':
            return params.quoteId ? 'hubspot_get_quote' : 'hubspot_list_quotes'
          case 'get_appointments':
            return params.appointmentId ? 'hubspot_get_appointment' : 'hubspot_list_appointments'
          case 'create_appointment':
            return 'hubspot_create_appointment'
          case 'update_appointment':
            return 'hubspot_update_appointment'
          case 'get_carts':
            return params.cartId ? 'hubspot_get_cart' : 'hubspot_list_carts'
          case 'list_owners':
            return 'hubspot_list_owners'
          case 'get_marketing_events':
            return params.eventId ? 'hubspot_get_marketing_event' : 'hubspot_list_marketing_events'
          case 'get_lists':
            return params.listId ? 'hubspot_get_list' : 'hubspot_list_lists'
          case 'create_list':
            return 'hubspot_create_list'
          default:
            throw new Error(`Unknown operation: ${params.operation}`)
        }
      },
      params: (params) => {
        const {
          accounts,
          oauthCredential,
          operation,
          propertiesToSet,
          properties,
          searchProperties,
          filterGroups,
          sorts,
          associations,
          listName,
          ...rest
        } = params

        const useSharedAccount = accounts && accounts !== 'manual'
        // const effectiveCredential = useSharedAccount ? (accounts as string) : (credential as string)

        const cleanParams: Record<string, any> = {
          oauthCredential,
        }

        const createUpdateOps = [
          'create_contact',
          'update_contact',
          'create_company',
          'update_company',
          'create_deal',
          'update_deal',
          'create_ticket',
          'update_ticket',
          'create_line_item',
          'update_line_item',
          'create_appointment',
          'update_appointment',
        ]
        if (propertiesToSet && createUpdateOps.includes(operation as string)) {
          cleanParams.properties = propertiesToSet
        }

        const getListOps = [
          'get_contacts',
          'get_companies',
          'get_deals',
          'list_objects',
          'get_object',
          'get_commerce_payments',
          'get_subscriptions',
          'get_tickets',
          'get_line_items',
          'get_quotes',
          'get_appointments',
          'get_carts',
        ]
        if (properties && !searchProperties && getListOps.includes(operation as string)) {
          cleanParams.properties = properties
        }

        const searchOps = ['search_contacts', 'search_companies', 'search_deals', 'search_tickets']
        if (searchProperties && searchOps.includes(operation as string)) {
          cleanParams.properties = searchProperties
        }

        if (filterGroups && searchOps.includes(operation as string)) {
          cleanParams.filterGroups = filterGroups
        }

        if (sorts && searchOps.includes(operation as string)) {
          cleanParams.sorts = sorts
        }

        const associationOps = [
          ...getListOps,
          'create_contact',
          'create_company',
          'create_deal',
          'create_ticket',
          'create_line_item',
          'create_appointment',
        ]
        if (associations && associationOps.includes(operation as string)) {
          cleanParams.associations = associations
        }

        if (listName && operation === 'create_list') {
          cleanParams.name = listName
        }

        if (operation === 'get_lists') {
          if (rest.limit) {
            cleanParams.count = rest.limit
            rest.limit = undefined
          }
          if (rest.after) {
            cleanParams.offset = rest.after
            rest.after = undefined
          }
        }

        const excludeKeys = [
          'propertiesToSet',
          'properties',
          'searchProperties',
          'filterGroups',
          'sorts',
          'associations',
          'listName',
        ]
        Object.entries(rest).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '' && !excludeKeys.includes(key)) {
            if (key === 'campaignGuids') {
              //JSON.parse is needed as safeStirng method is giving circular
              cleanParams.campaignGuid = JSON.parse(JSON.stringify(value))
            } else {
              cleanParams[key] = value
            }
          }
        })

        return cleanParams
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
    accounts: { type: 'string', description: 'Selected shared account' },
    oauthCredential: { type: 'string', description: 'HubSpot access token' },
    contactId: { type: 'string', description: 'Contact ID or email' },
    companyId: { type: 'string', description: 'Company ID or domain' },
    campaignGuid: {
      type: 'string',
      description: 'Campaign GUID for marketing operations',
    },
    campaignGuids: {
      type: 'string',
      description: 'List of Campaign GUIDs for metrics/revenue/spend operations',
    },
    spendId: { type: 'string', description: 'Spend ID for campaign spend retrieval' },
    budgetId: { type: 'string', description: 'Budget ID for campaign budget retrieval' },
    contactType: { type: 'string', description: 'Contact type for campaign reports' },
    assetType: { type: 'string', description: 'Asset type for campaign assets' },
    interval: {
      type: 'string',
      description:
        'Interval for email statistics histogram (DAY, HOUR, MINUTE, MONTH, QUARTER, QUARTER_HOUR, SECOND, WEEK, YEAR)',
    },
    emailIds: { type: 'string', description: 'Comma-separated list of email IDs (numbers only)' },
    emailId: { type: 'string', description: 'Email ID to retrieve' },
    archived: {
      type: 'string',
      description: 'Specifies whether to return archived emails (true/false)',
    },
    createdAfter: {
      type: 'string',
      description: 'Only return emails created after the specified time (ISO8601 format)',
    },
    createdBefore: {
      type: 'string',
      description: 'Only return emails created before the specified time (ISO8601 format)',
    },
    workflowNames: {
      type: 'string',
      description:
        'Include the names of any workflows associated with the returned emails (true/false)',
    },
    includeStats: { type: 'string', description: 'Include statistics with emails (true/false)' },
    isPublished: { type: 'string', description: 'Filter by published/draft emails (true/false)' },
    marketingCampaignNames: {
      type: 'string',
      description: 'Include the names for any associated marketing campaigns (true/false)',
    },
    startTimestamp: {
      type: 'string',
      description: 'The start timestamp of the time span, in ISO8601 representation',
    },
    endTimestamp: {
      type: 'string',
      description: 'The end timestamp of the time span, in ISO8601 representation',
    },
    dealId: { type: 'string', description: 'Deal ID' },
    ticketId: { type: 'string', description: 'Ticket ID' },
    lineItemId: { type: 'string', description: 'Line item ID' },
    quoteId: { type: 'string', description: 'Quote ID' },
    appointmentId: { type: 'string', description: 'Appointment ID' },
    cartId: { type: 'string', description: 'Cart ID' },
    eventId: { type: 'string', description: 'Marketing event ID' },
    listId: { type: 'string', description: 'List ID' },
    idProperty: { type: 'string', description: 'Property name to use as unique identifier' },
    propertiesToSet: { type: 'json', description: 'Properties to create/update (JSON object)' },
    properties: {
      type: 'string',
      description: 'Comma-separated properties to return (for list/get)',
    },
    associations: { type: 'string', description: 'Comma-separated object types for associations' },
    limit: { type: 'string', description: 'Maximum results per page' },
    after: { type: 'string', description: 'Pagination cursor' },
    query: { type: 'string', description: 'Search query string' },
    filterGroups: { type: 'json', description: 'Filter groups for search (JSON array)' },
    sorts: { type: 'json', description: 'Sort order (JSON array of strings or objects)' },
    searchProperties: { type: 'json', description: 'Properties to return in search (JSON array)' },
    objectType: {
      type: 'string',
      description:
        'CRM object type (e.g. appointments, 0-410 courses, 0-3 deals, discounts, companies, contacts, carts)',
    },
    objectId: {
      type: 'string',
      description: 'CRM object ID (for Get CRM Object or list associations)',
    },
    fromObjectType: { type: 'string', description: 'Source object type for association types' },
    toObjectType: { type: 'string', description: 'Target object type for associations' },
    commercePaymentId: { type: 'string', description: 'Commerce payment ID (empty to list all)' },
    subscriptionId: { type: 'string', description: 'Subscription ID (empty to list all)' },
    importId: { type: 'string', description: 'CRM import ID for Get Import' },
    pipelineId: { type: 'string', description: 'Pipeline ID for Get Pipeline' },
    propertyName: { type: 'string', description: 'Property name for Get Property' },
    dataSensitivity: { type: 'string', description: 'Data sensitivity filter for properties API' },
    listName: { type: 'string', description: 'Name for new list' },
    objectTypeId: { type: 'string', description: 'Object type ID for list' },
    processingType: { type: 'string', description: 'List processing type (MANUAL or DYNAMIC)' },
  },
  outputs: {
    users: { type: 'json', description: 'Array of user objects' },
    contacts: { type: 'json', description: 'Array of contact objects' },
    contact: { type: 'json', description: 'Single contact object' },
    companies: { type: 'json', description: 'Array of company objects' },
    company: { type: 'json', description: 'Single company object' },
    deals: { type: 'json', description: 'Array of deal objects' },
    campaigns: { type: 'json', description: 'Array of campaign objects' },
    campaign: { type: 'json', description: 'Single campaign object' },
    spend: {
      type: 'json',
      description: 'Campaign spend item (single object or array of objects for multiple campaigns)',
    },
    metrics: {
      type: 'json',
      description: 'Campaign metrics (single object or array of objects for multiple campaigns)',
    },
    revenue: {
      type: 'json',
      description: 'Campaign revenue (single object or array of objects for multiple campaigns)',
    },
    budgetTotals: { type: 'json', description: 'Campaign budget totals' },
    budgetItem: { type: 'json', description: 'Campaign budget item' },
    assets: { type: 'json', description: 'Campaign assets' },
    histogram: { type: 'json', description: 'Email statistics histogram data' },
    email: { type: 'json', description: 'Email object with all properties' },
    emails: { type: 'json', description: 'Array of email objects' },
    deal: { type: 'json', description: 'Single deal object' },
    tickets: { type: 'json', description: 'Array of ticket objects' },
    ticket: { type: 'json', description: 'Single ticket object' },
    lineItems: { type: 'json', description: 'Array of line item objects' },
    lineItem: { type: 'json', description: 'Single line item object' },
    quotes: { type: 'json', description: 'Array of quote objects' },
    quote: { type: 'json', description: 'Single quote object' },
    appointments: { type: 'json', description: 'Array of appointment objects' },
    appointment: { type: 'json', description: 'Single appointment object' },
    carts: { type: 'json', description: 'Array of cart objects' },
    cart: { type: 'json', description: 'Single cart object' },
    owners: { type: 'json', description: 'Array of owner objects' },
    events: { type: 'json', description: 'Array of marketing event objects' },
    event: { type: 'json', description: 'Single marketing event object' },
    lists: { type: 'json', description: 'Array of list objects' },
    list: { type: 'json', description: 'Single list object' },
    total: { type: 'number', description: 'Total number of matching results (for search)' },
    paging: { type: 'json', description: 'Pagination info with next/prev cursors' },
    metadata: { type: 'json', description: 'Operation metadata' },
    success: { type: 'boolean', description: 'Operation success status' },
    payload: {
      type: 'json',
      description: 'Full webhook payload array from HubSpot containing event details',
    },
    provider: {
      type: 'string',
      description: 'Provider name (hubspot)',
    },
    providerConfig: {
      appId: {
        type: 'string',
        description: 'HubSpot App ID',
      },
      clientId: {
        type: 'string',
        description: 'HubSpot Client ID',
      },
      triggerId: {
        type: 'string',
        description: 'Trigger ID (e.g., hubspot_company_created)',
      },
      clientSecret: {
        type: 'string',
        description: 'HubSpot Client Secret',
      },
      developerApiKey: {
        type: 'string',
        description: 'HubSpot Developer API Key',
      },
      curlSetWebhookUrl: {
        type: 'string',
        description: 'curl command to set webhook URL',
      },
      curlCreateSubscription: {
        type: 'string',
        description: 'curl command to create subscription',
      },
      webhookUrlDisplay: {
        type: 'string',
        description: 'Webhook URL display value',
      },
      propertyName: {
        type: 'string',
        description: 'Optional property name filter (for property change triggers)',
      },
    },
  } as any,
  triggerAllowed: true,
  triggers: {
    enabled: true,
    available: [
      'hubspot_contact_created',
      'hubspot_contact_deleted',
      'hubspot_contact_privacy_deleted',
      'hubspot_contact_property_changed',
      'hubspot_company_created',
      'hubspot_company_deleted',
      'hubspot_company_property_changed',
      'hubspot_conversation_creation',
      'hubspot_conversation_deletion',
      'hubspot_conversation_new_message',
      'hubspot_conversation_privacy_deletion',
      'hubspot_conversation_property_changed',
      'hubspot_deal_created',
      'hubspot_deal_deleted',
      'hubspot_deal_property_changed',
      'hubspot_ticket_created',
      'hubspot_ticket_deleted',
      'hubspot_ticket_property_changed',
    ],
  },
}
