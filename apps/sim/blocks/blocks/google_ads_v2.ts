import { GoogleAdsIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

export const GoogleAdsV2Block: BlockConfig<ToolResponse> = {
  type: 'google_ads_v2',
  name: 'Google Ads',
  description:
    'Ask anything about Google Ads in plain English — smart GAQL, comparisons, search terms, audits, and more',
  longDescription:
    'Natural-language Google Ads analytics powered by intent detection and GAQL generation. Supports campaign performance, period comparisons, search-term waste, quality score audits, device and audience breakdowns, sitelinks, placements, pacing, and multi-query account audits.',
  docsLink: 'https://docs.sim.ai/tools/google_ads',
  category: 'tools',
  bgColor: '#4285f4',
  icon: GoogleAdsIcon,
  subBlocks: [
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
        } catch (error) {
          console.error('Failed to fetch Google Ads accounts:', error)
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
          console.error('Failed to fetch Google Ads account:', error)
          return null
        }
      },
      placeholder: 'Select account...',
      required: true,
      mode: 'basic',
      canonicalParamId: 'accounts',
    },
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
      title: 'Question',
      type: 'long-input',
      placeholder:
        'Ask in plain English, e.g. "search terms last 30 days with zero conversions", "compare last 7 days vs prior 7", "full account audit"',
      rows: 4,
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `Help the user write a clear Google Ads analytics question.

Good examples:
- "Show campaign performance for the last 30 days"
- "Compare last 7 days vs prior 7 days — ROAS, CPA, impression share"
- "Top 20 search terms by cost with zero conversions last 30 days"
- "Keywords with quality score below 5 and spend over $50"
- "Device breakdown of spend and conversions last 14 days"
- "List all active sitelinks and final URLs"
- "Full account audit — top issues by wasted spend"

Return only the question text, nothing else.`,
      },
    },
  ],
  tools: {
    access: ['google_ads_query'],
    config: {
      tool: () => 'google_ads_query',
      params: (params) => ({
        accounts: params.accounts || params.accountsAdvanced,
        question: params.prompt,
      }),
    },
  },
  inputs: {
    prompt: { type: 'string', description: 'Natural language question about Google Ads data' },
    accounts: { type: 'string', description: 'Selected Google Ads account key' },
  },
  outputs: {
    success: { type: 'boolean', description: 'Whether the request succeeded' },
    query: { type: 'string', description: 'Original user question' },
    intents: { type: 'json', description: 'Detected query intents (audit, search_terms, comparison, etc.)' },
    gaql_query: { type: 'string', description: 'Primary GAQL query executed' },
    query_type: { type: 'string', description: 'Query type label' },
    date_range: { type: 'string', description: 'Primary date range (YYYY-MM-DD to YYYY-MM-DD)' },
    is_comparison: { type: 'boolean', description: 'Whether a comparison period was requested' },
    primary: {
      type: 'json',
      description: 'Primary period data: rows, totals, resource, row_count',
    },
    comparison: {
      type: 'json',
      description: 'Comparison period data (if is_comparison), else null',
    },
    additional_queries: {
      type: 'json',
      description: 'Extra query results for full audits (KEYWORDS_QS, SEARCH_TERMS_WASTED, etc.)',
    },
    rows: { type: 'json', description: 'Shortcut: primary.rows — exact GAQL result rows' },
    totals: { type: 'json', description: 'Shortcut: primary.totals — aggregated metrics' },
    campaigns: { type: 'json', description: 'Legacy campaign rollup (mainWeek.campaigns)' },
    mainWeek: { type: 'json', description: 'Legacy primary period summary' },
    comparisonWeek: { type: 'json', description: 'Legacy comparison period summary' },
    results: { type: 'json', description: 'Full API response payload' },
  },
}
