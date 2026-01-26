import { HubspotIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { AuthMode } from '@/blocks/types'
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
  const accounts = params.accounts
  const credential = params.credential

  const useSharedAccount = accounts && accounts !== 'manual'
  const credentialId = (useSharedAccount ? accounts : credential) as string

  // If no credential ID, we can't validate.
  // Ideally we clear the value, but if it's just loading, we shouldn't.
  // However, if we switched from Account A (valid) to Account B (loading),
  // we technically don't know if the value is valid for B yet.
  // But usually this function runs synchronously.
  if (!credentialId) {
    return isMulti ? '[]' : ''
  }

  const cached = campaignCache.get(credentialId)

  // If we have cached data for this credential, we MUST validate against it.
  if (cached) {
    const validIds = new Set(cached.data.map((o) => o.id))

    if (isMulti) {
      // Params value might be an array or stringified array or JSON
      let currentValues: string[] = []
      const rawValue = params.campaignGuids
      if (Array.isArray(rawValue)) {
        currentValues = rawValue
      } else if (typeof rawValue === 'string' && rawValue) {
        // Might be just a string if it's a single value acting as array?
        // Or if it's JSON stringified?
        // Usually multi-select values come as arrays in params if processed, but key updates might send them raw.
        // Let's assume array if properly handled by framework.
        // For safety, let's treat string as single ID or try to parse if it looks like JSON?
        // Simpler: just check if it's in the set.
        currentValues = [rawValue]
      }

      if (currentValues.length === 0) return '[]'

      // Check if ALL current values are valid
      const allValid = currentValues.every((id) => validIds.has(id))
      return allValid ? (undefined as unknown as string) : '[]'
    } else {
      const currentValue = params.campaignGuid
      if (!currentValue) return ''
      return validIds.has(currentValue) ? (undefined as unknown as string) : ''
    }
  }

  // If cache is missing (e.g. first load, or fresh account switch pending fetch),
  // we CANNOT validate yet.
  // If we clear it now, we might clear a valid saved value before it loads.
  // BUT, if we switched accounts, the value from the OLD account is definitely invalid for the NEW account (HubSpot GUIDs are unique).
  // Detecting "account switch" vs "initial load" is hard here stateless-ly.
  // Strategy: If cache is missing, we assume it's loading.
  // Risk: Stale value persists until fetch completes.
  // Once fetch completes, this function should technically re-run if dependecies trigger it?
  // Or fetch completion triggers a render which calls this.
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
  bgColor: '#FF7A59',
  icon: HubspotIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Get Users', id: 'get_users' },
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
      serviceId: 'hubspot',
      hidden: true,
      requiredScopes: [
        'crm.objects.contacts.read',
        'crm.objects.contacts.write',
        'crm.objects.companies.read',
        'crm.objects.companies.write',
        'crm.objects.deals.read',
        'crm.objects.deals.write',
        'crm.objects.owners.read',
        'crm.objects.users.read',
        'crm.objects.users.write',
        'crm.objects.marketing_events.read',
        'crm.objects.marketing_events.write',
        'crm.objects.line_items.read',
        'crm.objects.line_items.write',
        'crm.objects.quotes.read',
        'crm.objects.quotes.write',
        'crm.objects.appointments.read',
        'crm.objects.appointments.write',
        'crm.objects.carts.read',
        'crm.objects.carts.write',
        'crm.import',
        'crm.lists.read',
        'crm.lists.write',
        'tickets',
        'crm.objects.subscriptions.write',
        'crm.schemas.subscriptions.write',
        'crm.schemas.invoices.write',
        'content',
        'tax_rates.read',
        'social',
        'crm.objects.goals.write',
        'automation',
        'actions',
        'timeline',
        'business-intelligence',
        'forms',
        'files',
        'record_images.signed_urls.read',
        'crm.objects.products.read',
        'integration-sync',
        'crm.objects.products.write',
        'e-commerce',
        'accounting',
        'sales-email-read',
        'crm.objects.commercepayments.write',
        'crm.objects.projects.write',
        'crm.schemas.commercepayments.write',
        'crm.objects.projects.read',
        'forms-uploaded-files',
        'communication_preferences.read_write',
        'crm.objects.partner-services.read',
        'crm.objects.partner-services.write',
        'crm.schemas.projects.read',
        'crm.extensions_calling_transcripts.read',
        'crm.extensions_calling_transcripts.write',
        'crm.schemas.projects.write',
        'communication_preferences.read',
        'communication_preferences.write',
        'settings.users.write',
        'conversations.visitor_identification.tokens.create',
        'files.ui_hidden.read',
        'crm.schemas.custom.read',
        'crm.objects.custom.read',
        'crm.objects.custom.write',
        'settings.users.read',
        'crm.schemas.contacts.read',
        'cms.domains.read',
        'cms.domains.write',
        'media_bridge.read',
        'media_bridge.write',
        'settings.billing.write',
        'crm.objects.feedback_submissions.read',
        'crm.schemas.companies.read',
        'crm.schemas.companies.write',
        'crm.schemas.contacts.write',
        'crm.schemas.deals.read',
        'crm.schemas.deals.write',
        'cms.knowledge_base.articles.publish',
        'cms.knowledge_base.articles.write',
        'cms.knowledge_base.articles.read',
        'cms.knowledge_base.settings.read',
        'cms.knowledge_base.settings.write',
        'settings.users.teams.write',
        'settings.users.teams.read',
        'conversations.read',
        'conversations.write',
        'crm.schemas.quotes.read',
        'crm.schemas.line_items.read',
        'account-info.security.read',
        'crm.export',
        'integrations.zoom-app.playbooks.read',
        'settings.currencies.read',
        'settings.currencies.write',
        'external_integrations.forms.access',
        'crm.objects.goals.read',
        'ctas.read',
        'crm.objects.subscriptions.read',
        'crm.schemas.subscriptions.read',
        'crm.schemas.commercepayments.read',
        'crm.objects.commercepayments.read',
        'crm.objects.invoices.read',
        'crm.schemas.invoices.read',
        'settings.security.security_health.read',
        'crm.schemas.carts.write',
        'crm.schemas.carts.read',
        'crm.pipelines.orders.write',
        'crm.pipelines.orders.read',
        'crm.schemas.orders.write',
        'crm.schemas.orders.read',
        'crm.objects.orders.write',
        'crm.objects.orders.read',
        'conversations.custom_channels.read',
        'conversations.custom_channels.write',
        'crm.objects.leads.read',
        'crm.objects.leads.write',
        'crm.objects.partner-clients.read',
        'crm.objects.partner-clients.write',
        'marketing.campaigns.read',
        'marketing.campaigns.write',
        'marketing.campaigns.revenue.read',
        'automation.sequences.enrollments.write',
        'automation.sequences.read',
        'cms.membership.access_groups.read',
        'cms.membership.access_groups.write',
        'crm.objects.courses.read',
        'crm.objects.courses.write',
        'crm.objects.listings.read',
        'crm.objects.listings.write',
        'crm.objects.services.read',
        'crm.objects.services.write',
        'scheduler.meetings.meeting-link.read',
        'crm.objects.invoices.write',
        'crm.schemas.services.read',
        'crm.schemas.services.write',
        'crm.schemas.courses.read',
        'crm.schemas.courses.write',
        'crm.schemas.listings.read',
        'crm.schemas.listings.write',
        'crm.schemas.appointments.read',
        'crm.schemas.appointments.write',
      ],
      placeholder: 'Select HubSpot account',
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
      id: 'idProperty',
      title: 'ID Property',
      type: 'short-input',
      placeholder: 'Required if using email/domain (e.g., "email" or "domain")',
      condition: {
        field: 'operation',
        value: ['get_contacts', 'update_contact', 'get_companies', 'update_company'],
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
        value: ['create_contact', 'update_contact', 'create_company', 'update_company'],
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
      condition: { field: 'operation', value: ['get_contacts', 'get_companies', 'get_deals'] },
    },
    {
      id: 'associations',
      title: 'Associations',
      type: 'short-input',
      placeholder: 'Comma-separated object types (e.g., "companies,deals")',
      condition: {
        field: 'operation',
        value: ['get_contacts', 'get_companies', 'get_deals', 'create_contact', 'create_company'],
      },
    },
    {
      id: 'limit',
      title: 'Limit',
      type: 'short-input',
      placeholder: 'Max results (list: 100, search: 200)',
      condition: {
        field: 'operation',
        value: [
          'get_users',
          'get_contacts',
          'get_companies',
          'get_deals',
          'search_contacts',
          'search_companies',
          'list_campaigns',
        ],
      },
    },
    {
      id: 'after',
      title: 'After (Pagination)',
      type: 'short-input',
      placeholder: 'Pagination cursor from previous response',
      condition: {
        field: 'operation',
        value: [
          'get_contacts',
          'get_companies',
          'get_deals',
          'search_contacts',
          'search_companies',
          'list_campaigns',
          'get_campaign_contacts',
          'get_campaign_assets',
        ],
      },
    },
    {
      id: 'query',
      title: 'Search Query',
      type: 'short-input',
      placeholder: 'Search term (e.g., company name, contact email)',
      condition: { field: 'operation', value: ['search_contacts', 'search_companies'] },
    },
    {
      id: 'filterGroups',
      title: 'Filter Groups',
      type: 'long-input',
      placeholder:
        'JSON array of filter groups (e.g., [{"filters":[{"propertyName":"email","operator":"EQ","value":"test@example.com"}]}])',
      condition: { field: 'operation', value: ['search_contacts', 'search_companies'] },
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
      condition: { field: 'operation', value: ['search_contacts', 'search_companies'] },
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
      condition: { field: 'operation', value: ['search_contacts', 'search_companies'] },
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
            return 'hubspot_list_deals'
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
          default:
            throw new Error(`Unknown operation: ${params.operation}`)
        }
      },
      params: (params) => {
        const {
          accounts,
          credential,
          operation,
          propertiesToSet,
          properties,
          searchProperties,
          filterGroups,
          sorts,
          associations,
          ...rest
        } = params

        const useSharedAccount = accounts && accounts !== 'manual'
        const effectiveCredential = useSharedAccount ? (accounts as string) : (credential as string)

        const cleanParams: Record<string, any> = {
          credential: effectiveCredential,
        }

        const createUpdateOps = [
          'create_contact',
          'update_contact',
          'create_company',
          'update_company',
        ]
        if (propertiesToSet && createUpdateOps.includes(operation as string)) {
          cleanParams.properties = propertiesToSet
        }

        const getListOps = ['get_contacts', 'get_companies', 'get_deals']
        if (properties && !searchProperties && getListOps.includes(operation as string)) {
          cleanParams.properties = properties
        }

        const searchOps = ['search_contacts', 'search_companies']
        if (searchProperties && searchOps.includes(operation as string)) {
          cleanParams.properties = searchProperties
        }

        if (filterGroups && searchOps.includes(operation as string)) {
          cleanParams.filterGroups = filterGroups
        }

        if (sorts && searchOps.includes(operation as string)) {
          cleanParams.sorts = sorts
        }

        if (associations && ['create_contact', 'create_company'].includes(operation as string)) {
          cleanParams.associations = associations
        }

        const excludeKeys = [
          'propertiesToSet',
          'properties',
          'searchProperties',
          'filterGroups',
          'sorts',
          'associations',
        ]
        Object.entries(rest).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '' && !excludeKeys.includes(key)) {
            if (key === 'campaignGuids') {
              //JSON.parse is needed as safeStirng method is giving circular
              cleanParams['campaignGuid'] = JSON.parse(JSON.stringify(value))
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
    credential: { type: 'string', description: 'HubSpot access token' },
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
    idProperty: { type: 'string', description: 'Property name to use as unique identifier' },
    propertiesToSet: { type: 'json', description: 'Properties to create/update (JSON object)' },
    properties: {
      type: 'string',
      description: 'Comma-separated properties to return (for list/get)',
    },
    associations: { type: 'string', description: 'Comma-separated object types for associations' },
    limit: {
      type: 'string',
      description: 'Maximum results (list: 100, search: 200, emails: default 10)',
    },
    after: { type: 'string', description: 'Pagination cursor' },
    query: { type: 'string', description: 'Search query string' },
    filterGroups: { type: 'json', description: 'Filter groups for search (JSON array)' },
    sorts: { type: 'json', description: 'Sort order (JSON array of strings or objects)' },
    searchProperties: { type: 'json', description: 'Properties to return in search (JSON array)' },
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
