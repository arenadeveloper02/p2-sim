import { GoogleIcon } from '@/components/icons'
import { getScopesForService } from '@/lib/oauth/utils'
import {
  isAdminWorkspace,
  resolveWorkspaceIdForAdminCheck,
} from '@/lib/workspaces/is-admin-workspace'
import type { BlockConfig } from '@/blocks/types'
import { AuthMode } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

const GOOGLE_ADS_V1_COND_NEVER = '__google_ads_v1_cond_never__'

/** Numeric Google Ads customer ID (digits only, optional dashes). */
function normalizeNumericCustomerId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.trim().replace(/-/g, '')
  if (!/^\d+$/.test(cleaned)) return undefined
  return cleaned
}

/** Show admin OAuth account picker (admin workspaces only). */
function googleAdsV1AdminOnlyCondition(values?: Record<string, unknown>) {
  const isAdmin = isAdminWorkspace(resolveWorkspaceIdForAdminCheck(values))
  if (isAdmin) {
    return { field: 'prompt', value: GOOGLE_ADS_V1_COND_NEVER, not: true as const }
  }
  return { field: 'prompt', value: GOOGLE_ADS_V1_COND_NEVER }
}

/** Show channel-account picker (non-admin workspaces only). */
function googleAdsV1NonAdminOnlyCondition(values?: Record<string, unknown>) {
  const isAdmin = isAdminWorkspace(resolveWorkspaceIdForAdminCheck(values))
  if (isAdmin) {
    return { field: 'prompt', value: GOOGLE_ADS_V1_COND_NEVER }
  }
  return { field: 'prompt', value: GOOGLE_ADS_V1_COND_NEVER, not: true as const }
}

export const GoogleAdsV1Block: BlockConfig<ToolResponse> = {
  type: 'google_ads_v1',
  name: 'Google Ads V1',
  description: 'AI-powered Google Ads query tool with simplified GAQL generation',
  longDescription:
    'Simplified Google Ads block that uses AI (Grok with GPT-4o fallback) to automatically generate GAQL queries from natural language prompts. Perfect for quick queries without complex configuration. Supports campaign performance, keyword analysis, search terms, and more.',
  docsLink: 'https://docs.sim.ai/tools/google-ads-v1',
  category: 'tools',
  bgColor: '#4285f4',
  icon: GoogleIcon,
  authMode: AuthMode.OAuth,
  subBlocks: [
    {
      id: 'oauthCredential',
      title: 'Google Ads Account',
      type: 'short-input',
      hidden: true,
      required: true,
      condition: googleAdsV1AdminOnlyCondition,
    },
    {
      id: 'googleAdsV1Account',
      title: 'Google Ads Account',
      type: 'google-ads-v1-account',
      placeholder: 'Select Google Ads account',
      mode: 'basic',
      serviceId: 'google-ads',
      requiredScopes: getScopesForService('google-ads'),
      condition: googleAdsV1AdminOnlyCondition,
    },
    {
      id: 'developerToken',
      title: 'Developer Token',
      type: 'short-input',
      placeholder: 'Enter your Google Ads API developer token',
      required: true,
      password: true,
      mode: 'basic',
      condition: googleAdsV1AdminOnlyCondition,
    },
    {
      id: 'customerId',
      title: 'Customer ID',
      type: 'short-input',
      placeholder: 'Google Ads customer ID (no dashes)',
      required: true,
      mode: 'basic',
      condition: googleAdsV1AdminOnlyCondition,
    },
    {
      id: 'managerCustomerId',
      title: 'Manager Customer ID',
      type: 'short-input',
      placeholder: 'MCC account ID (required when Customer ID is a client account)',
      mode: 'basic',
      condition: googleAdsV1AdminOnlyCondition,
    },
    {
      id: 'accountsAdminAdvanced',
      title: 'Google Ads Account',
      type: 'short-input',
      canonicalParamId: 'accounts',
      placeholder: 'Google Ads customer ID (no dashes)',
      required: true,
      mode: 'advanced',
      condition: googleAdsV1AdminOnlyCondition,
    },
    {
      id: 'accounts',
      title: 'Google Ads Account',
      type: 'dropdown',
      options: [],
      fetchOptions: async () => {
        try {
          const response = await fetch('/api/google-ads/accounts')
          const data = await response.json()

          if (data?.success && data.accounts && typeof data.accounts === 'object') {
            const accounts = data.accounts as Record<string, { id: string; name: string }>
            return Object.entries(accounts).map(([key, account]) => ({
              id: key,
              label: account.name,
              value: key,
            }))
          }
          return []
        } catch {
          return []
        }
      },
      fetchOptionById: async (optionId: string) => {
        try {
          const response = await fetch('/api/google-ads/accounts')
          const data = await response.json()

          if (data.success && data.accounts[optionId]) {
            const account = data.accounts[optionId] as { id: string; name: string }
            return {
              id: optionId,
              label: account.name,
              value: optionId,
            }
          }
          return null
        } catch {
          return null
        }
      },
      placeholder: 'Select account...',
      required: true,
      mode: 'basic',
      canonicalParamId: 'accounts',
      condition: googleAdsV1NonAdminOnlyCondition,
    },
    {
      id: 'accountsAdvanced',
      title: 'Google Ads Account',
      type: 'short-input',
      canonicalParamId: 'accounts',
      placeholder: 'Enter account key (e.g., ami, heartland)',
      required: true,
      mode: 'advanced',
      condition: googleAdsV1NonAdminOnlyCondition,
    },
    {
      id: 'prompt',
      title: 'Natural Language Query',
      type: 'long-input',
      placeholder:
        'Describe what data you want in plain English, e.g., "show campaign performance for the last 30 days", "keywords with quality score below 5", "search terms this week ordered by cost"',
      rows: 3,
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `You are a Google Ads V1 query assistant. Help users create effective natural language prompts for Google Ads data.

### EXAMPLES OF GOOD PROMPTS
- "show campaign performance for the last 30 days"
- "keywords with quality score below 5"
- "search terms this week ordered by cost"
- "campaigns that spent more than $100 last week"
- "ad groups in Brand campaign"
- "RSA ads with poor ad strength"
- "geographic performance by state"
- "top 20 keywords by conversions"

### AVAILABLE DATA
**Resources (Tables):**
- campaign: Campaign performance data
- ad_group: Ad group information
- keyword_view: Keywords with quality scores
- ad_group_ad: Ad-level data (RSA ads)
- campaign_search_term_view: Search query reports
- geographic_view: Location performance
- campaign_asset: Extensions/sitelinks

**Metrics:**
- impressions, clicks, cost
- conversions, conversion value
- CTR, average CPC
- quality score (keywords only)

**Date Ranges:**
- last 7/30/90 days
- this week, last week
- this month, last month
- yesterday, today

### HOW IT WORKS
The AI will automatically:
1. Generate a valid GAQL query from your prompt
2. Handle all date filtering logic
3. Add proper filters (e.g., only active campaigns)
4. Execute the query and return results

Generate a clear, specific prompt for what the user wants to query from Google Ads.`,
      },
    },
  ],
  tools: {
    access: ['google_ads_v1_query'],
    config: {
      tool: () => 'google_ads_v1_query',
      params: (params) => {
        const result: Record<string, unknown> = {
          prompt: params.prompt,
        }

        if (params.oauthCredential) {
          result.oauthCredential = params.oauthCredential
        }

        const customerIdValue = params.oauthCredential
          ? normalizeNumericCustomerId(params.customerId) ??
            normalizeNumericCustomerId(params.accounts)
          : typeof params.accounts === 'string'
            ? params.accounts
            : normalizeNumericCustomerId(params.customerId)

        if (customerIdValue) {
          result.accounts = customerIdValue
          if (params.oauthCredential) {
            result.customerId = customerIdValue
          }
        }

        if (
          params.oauthCredential &&
          typeof params.managerCustomerId === 'string' &&
          params.managerCustomerId.trim()
        ) {
          result.managerCustomerId = params.managerCustomerId.trim()
        }

        if (
          params.oauthCredential &&
          typeof params.developerToken === 'string' &&
          params.developerToken.trim()
        ) {
          result.developerToken = params.developerToken.trim()
        }

        return result
      },
    },
  },
  inputs: {
    prompt: {
      type: 'string',
      description: 'Natural language description of what data you want',
    },
    accounts: { type: 'string', description: 'Google Ads customer ID (no dashes)' },
    customerId: { type: 'string', description: 'Google Ads customer ID (no dashes)' },
    managerCustomerId: {
      type: 'string',
      description: 'Manager (MCC) customer ID for login-customer-id header',
    },
    developerToken: { type: 'string', description: 'Google Ads API developer token' },
    oauthCredential: { type: 'string', description: 'Google Ads OAuth credential (admin workspaces)' },
  },
  outputs: {
    success: { type: 'boolean', description: 'Whether the query succeeded' },
    query: { type: 'string', description: 'Original natural language query' },
    gaql_query: { type: 'string', description: 'Generated GAQL query' },
    query_type: { type: 'string', description: 'Type of query (campaigns, keywords, etc.)' },
    tables_used: { type: 'json', description: 'List of tables used in the query' },
    metrics_used: { type: 'json', description: 'List of metrics used in the query' },
    results: { type: 'json', description: 'Query results with campaigns and totals' },
    account: { type: 'json', description: 'Account information (id, name)' },
    execution_time_ms: { type: 'number', description: 'Query execution time in milliseconds' },
  },
}
