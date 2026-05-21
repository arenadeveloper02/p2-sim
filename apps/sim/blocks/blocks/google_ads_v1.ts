import { GoogleIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

export const GoogleAdsV1Block: BlockConfig<ToolResponse> = {
  type: 'google_ads_v1',
  name: 'Google Ads V1',
  description: 'AI-powered Google Ads tool with multi-skill routing (GAQL queries & RSA ad copy)',
  longDescription:
    'Multi-skill Google Ads block that uses AI to automatically route between GAQL query generation and RSA ad copy creation. Supports campaign performance, keyword analysis, search terms, and responsive search ad generation - all from natural language prompts.',
  docsLink: 'https://docs.sim.ai/tools/google-ads-v1',
  category: 'tools',
  bgColor: '#4285f4',
  icon: GoogleIcon,
  subBlocks: [
    // Google Ads Account (basic mode - dropdown)
    {
      id: 'accounts',
      title: 'Google Ads Account',
      type: 'dropdown',
      options: [],
      fetchOptions: async () => {
        try {
          const response = await fetch('/api/google-ads/accounts')
          const data = await response.json()

          console.log('Google Ads V1 API response:', data)

          if (data?.success && data.accounts && typeof data.accounts === 'object') {
            const accounts = data.accounts as Record<string, { id: string; name: string }>
            const options = Object.entries(accounts).map(([key, account]) => ({
              id: key,
              label: account.name,
              value: key,
            }))
            console.log('Google Ads V1 options:', options)
            return Array.isArray(options) ? options : []
          }
          console.log('Google Ads V1: Invalid response format')
          return []
        } catch (error) {
          console.error('Failed to fetch Google Ads V1 accounts:', error)
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
        } catch (error) {
          console.error('Failed to fetch Google Ads V1 account:', error)
          return null
        }
      },
      placeholder: 'Select account...',
      required: true,
      mode: 'basic',
      canonicalParamId: 'accounts',
    },
    // Google Ads Account (advanced mode - text input)
    {
      id: 'accountsAdvanced',
      title: 'Google Ads Account',
      type: 'short-input',
      canonicalParamId: 'accounts',
      placeholder: 'Enter account key (e.g., ami, heartland)',
      required: true,
      mode: 'advanced',
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
        prompt: `You are a Google Ads V1 assistant. Help users create effective natural language prompts for Google Ads data and ad copy.

### EXAMPLES OF GOOD PROMPTS

**Data Queries:**
- "show campaign performance for the last 30 days"
- "keywords with quality score below 5"
- "search terms this week ordered by cost"
- "campaigns that spent more than $100 last week"
- "ad groups in Brand campaign"
- "geographic performance by state"
- "top 20 keywords by conversions"

**Ad Copy Generation:**
- "Write 15 RSA headlines + 4 descriptions for dental clinic"
- "Generate RSA ad copy for e-commerce store selling shoes"
- "Create responsive search ads for SaaS product with trial offer"
- "Write RSA headlines for local plumber service"

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
1. Analyze your query and decide which skill to use
2. For data queries: Generate a valid GAQL query, handle date filtering, execute and return results
3. For ad copy: Generate RSA headlines and descriptions with character counts and pin positions

Generate a clear, specific prompt for what the user wants to query or generate from Google Ads.`,
      },
    },
  ],
  tools: {
    access: ['google_ads_v1_query'],
    config: {
      tool: () => 'google_ads_v1_query',
      params: (params) => ({
        accounts: params.accounts,
        prompt: params.prompt,
      }),
    },
  },
  inputs: {
    prompt: {
      type: 'string',
      description: 'Natural language description of what data you want',
    },
    accounts: { type: 'string', description: 'Selected Google Ads account' },
  },
  outputs: {
    success: { type: 'boolean', description: 'Whether the request succeeded' },
    skill: { type: 'string', description: 'Which skill was used (gaql or rsa)' },
    query: { type: 'string', description: 'Original natural language query' },
    // GAQL-specific outputs
    gaql_query: { type: 'string', description: 'Generated GAQL query (if skill=gaql)' },
    query_type: { type: 'string', description: 'Type of query (campaigns, keywords, etc.) (if skill=gaql)' },
    tables_used: { type: 'json', description: 'List of tables used in the query (if skill=gaql)' },
    metrics_used: { type: 'json', description: 'List of metrics used in the query (if skill=gaql)' },
    results: { type: 'json', description: 'Query results with campaigns and totals (if skill=gaql)' },
    date_range: { type: 'json', description: 'Date range used for the query (if skill=gaql)' },
    row_count: { type: 'number', description: 'Number of rows returned (if skill=gaql)' },
    total_rows: { type: 'number', description: 'Total rows available (if skill=gaql)' },
    totals: { type: 'json', description: 'Aggregated totals (if skill=gaql)' },
    // RSA-specific outputs
    headlines: { type: 'json', description: 'RSA headlines with character counts and pin positions (if skill=rsa)' },
    descriptions: { type: 'json', description: 'RSA descriptions with character counts (if skill=rsa)' },
    // Common outputs
    account: { type: 'json', description: 'Account information (id, name)' },
    execution_time_ms: { type: 'number', description: 'Request execution time in milliseconds' },
  },
}
