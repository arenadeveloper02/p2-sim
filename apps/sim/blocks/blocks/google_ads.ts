import { GoogleIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { GoogleAdsResponse } from '@/tools/google_ads/types'

export const GoogleAdsBlock: BlockConfig<GoogleAdsResponse> = {
  type: 'google_ads',
  name: 'Google Ads',
  description: 'Query Google Ads campaign data and analytics',
  longDescription:
    'The Google Ads block allows you to query comprehensive campaign performance data including clicks, impressions, costs, conversions, and other key metrics. Supports flexible date ranges, account filtering, and various query types including campaigns, performance, and cost analysis.',
  docsLink: 'https://docs.sim.ai/tools/google-ads',
  category: 'tools',
  bgColor: '#4285f4',
  icon: GoogleIcon,
  subBlocks: [
    // Google Ads Account (basic mode - dropdown)
    {
      id: 'accounts',
      title: 'Google Ads Account',
      type: 'dropdown',
      options: [
        // Static fallback options
        { label: 'AMI', id: 'ami' },
        { label: 'Heartland', id: 'heartland' },
        { label: 'NHI', id: 'nhi' },
        { label: 'OIC-Culpeper', id: 'oic_culpeper' },
        { label: 'ODC-AL', id: 'odc_al' },
      ],
      fetchOptions: async () => {
        try {
          const response = await fetch('/api/google-ads/accounts')
          const data = await response.json()

          console.log('Google Ads API response:', data)

          if (data.success && data.accounts) {
            const accounts = data.accounts as Record<string, { id: string; name: string }>
            const options = Object.entries(accounts).map(([key, account]) => ({
              id: key,
              label: account.name,
              value: key,
            }))
            console.log('Google Ads options:', options)
            return options
          }
          console.log('Google Ads: No success or no accounts')
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
      id: 'question',
      title: 'Question / Query',
      type: 'long-input',
      placeholder:
        'Ask any question about Google Ads data, e.g., "Show me campaign performance for last 30 days", "What are my top spending campaigns this month?", "How many conversions did I get last week?"',
      rows: 3,
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `You are a Google Ads query assistant. Help users create effective questions for Google Ads data analysis.

### EXAMPLES OF GOOD QUESTIONS
- "Show me campaign performance for last 30 days"
- "What are my top spending campaigns this month?"
- "How many conversions did I get last week?"
- "Which campaigns have the highest CTR?"
- "Show me cost analysis for the last 15 days"
- "What's my impression share for active campaigns?"
- "Compare this month vs last month performance"
- "Show me keyword performance data"

### AVAILABLE METRICS
- Clicks, Impressions, Cost, Conversions
- CTR (Click-through rate), CPC (Cost per click)
- Conversion rate, Cost per conversion
- Impression share, Budget lost share
- ROAS (Return on ad spend)

### TIME PERIODS
- Last 7/15/30 days
- This/Last month, This/Last week
- Yesterday, Today
- Specific date ranges

Generate a clear, specific question about Google Ads performance based on the user's request.`,
      },
    },
  ],
  tools: {
    access: ['google_ads_query'],
    config: {
      tool: () => 'google_ads_query',
      params: (params) => ({
        accounts: params.accounts,
        question: params.question, // Pass the user's question
        query_type: 'campaigns', // Default fallback
        period_type: 'last_30_days', // Default fallback
        output_format: 'detailed',
        sort_by: 'cost_desc',
      }),
    },
  },
  inputs: {
    question: { type: 'string', description: 'User question about Google Ads data' },
    accounts: { type: 'string', description: 'Selected Google Ads account' },
  },
  outputs: {
    query: { type: 'string', description: 'Executed query' },
    results: { type: 'json', description: 'Google Ads campaign data and analytics' },
    grand_totals: { type: 'json', description: 'Aggregated totals across all accounts' },
    data_availability: { type: 'json', description: 'Data availability information' },
  },
}
