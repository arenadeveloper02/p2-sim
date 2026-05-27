import { GoogleIcon } from '@/components/icons'
import {
  isAdminWorkspace,
  resolveExecutionWorkspaceId,
  resolveWorkspaceIdForAdminCheck,
} from '@/lib/workspaces/is-admin-workspace'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

const GOOGLE_ADS_V1_COND_NEVER = '__google_ads_v1_cond_never__'

/** Resolves account/customer ID from serialized params (supports legacy `customerId` key). */
function resolveGoogleAdsV1AccountId(params: Record<string, unknown>): string | undefined {
  for (const key of ['accountId', 'customerId'] as const) {
    const value = params[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value)
    }
  }
  return undefined
}

/** Show admin account dropdown fields (admin workspaces only). */
function googleAdsV1AdminOnlyCondition(values?: Record<string, unknown>) {
  const isAdmin = isAdminWorkspace(resolveWorkspaceIdForAdminCheck(values))
  if (isAdmin) {
    return { field: 'prompt', value: GOOGLE_ADS_V1_COND_NEVER, not: true as const }
  }
  return { field: 'prompt', value: GOOGLE_ADS_V1_COND_NEVER }
}

/** Show explicit Google Ads API credential fields (non-admin workspaces only). */
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
  subBlocks: [
    {
      id: 'clientId',
      title: 'Client ID',
      type: 'short-input',
      placeholder: 'Google OAuth client ID',
      required: true,
      condition: googleAdsV1NonAdminOnlyCondition,
    },
    {
      id: 'clientSecret',
      title: 'Client Secret',
      type: 'short-input',
      placeholder: 'Google OAuth client secret',
      required: true,
      password: true,
      condition: googleAdsV1NonAdminOnlyCondition,
    },
    {
      id: 'refreshToken',
      title: 'Refresh Token',
      type: 'short-input',
      placeholder: 'Google OAuth refresh token',
      required: true,
      password: true,
      condition: googleAdsV1NonAdminOnlyCondition,
    },
    {
      id: 'developerToken',
      title: 'Developer Token',
      type: 'short-input',
      placeholder: 'Enter your Google Ads API developer token',
      required: true,
      password: true,
      condition: googleAdsV1NonAdminOnlyCondition,
    },
    {
      id: 'accountId',
      title: 'Account ID',
      type: 'short-input',
      placeholder: 'Google Ads account / customer ID (no dashes)',
      required: true,
      condition: googleAdsV1NonAdminOnlyCondition,
    },
    {
      id: 'managerCustomerId',
      title: 'Manager Customer ID',
      type: 'short-input',
      placeholder: 'Manager account ID (optional)',
      mode: 'advanced',
      condition: googleAdsV1NonAdminOnlyCondition,
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
            const options = Object.entries(accounts).map(([key, account]) => ({
              id: key,
              label: account.name,
              value: key,
            }))
            return Array.isArray(options) ? options : []
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
      placeholder: 'Select Google Ads account',
      required: true,
      mode: 'basic',
      canonicalParamId: 'accounts',
      condition: googleAdsV1AdminOnlyCondition,
    },
    {
      id: 'accountsAdvanced',
      title: 'Google Ads Account',
      type: 'short-input',
      canonicalParamId: 'accounts',
      placeholder: 'Enter account key (e.g., ami, heartland)',
      required: true,
      mode: 'advanced',
      condition: googleAdsV1AdminOnlyCondition,
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
        const workspaceId = resolveExecutionWorkspaceId(
          params as Record<string, unknown> | undefined
        )
        const accountId = resolveGoogleAdsV1AccountId(params as Record<string, unknown>)

        const result: Record<string, unknown> = {
          prompt: params.prompt,
          workspaceId,
          accounts: params.accounts ?? params.accountsAdvanced,
          clientId: params.clientId,
          clientSecret: params.clientSecret,
          refreshToken: params.refreshToken,
          developerToken: params.developerToken,
          managerCustomerId: params.managerCustomerId,
          _context: params._context,
        }

        if (accountId) {
          result.accountId = accountId
          result.customerId = accountId
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
    accounts: { type: 'string', description: 'Selected Google Ads account' },
    clientId: { type: 'string', description: 'Google OAuth client ID' },
    clientSecret: { type: 'string', description: 'Google OAuth client secret' },
    refreshToken: { type: 'string', description: 'Google OAuth refresh token' },
    developerToken: { type: 'string', description: 'Google Ads API developer token' },
    accountId: { type: 'string', description: 'Google Ads account ID (numeric, no dashes)' },
    customerId: { type: 'string', description: 'Google Ads customer ID (numeric, no dashes)' },
    managerCustomerId: { type: 'string', description: 'Manager account customer ID' },
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
