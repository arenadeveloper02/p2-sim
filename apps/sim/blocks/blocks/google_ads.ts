import { GoogleIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { GoogleAdsResponse } from '@/tools/google_ads/types'

// Google Ads accounts configuration
const GOOGLE_ADS_ACCOUNTS = {
  ami: { id: '7284380454', name: 'AMI' },
  auhi: { id: '4482250764', name: 'AUHI' },
  acalvio: { id: '9011732980', name: 'Acalvio' },
  altula: { id: '1160331216', name: 'Altula' },
  arenaplay: { id: '1830946644', name: 'Arenaplay' },
  cpic: { id: '1757492986', name: 'CPIC' },
  capitalcitynurses: { id: '8395621144', name: 'CapitalCityNurses.com' },
  careadvantage: { id: '9059182052', name: 'CareAdvantage' },
  chancey_reynolds: { id: '7098393346', name: 'Chancey & Reynolds' },
  chevron_july: { id: '2654484646', name: 'Chevron-July-01' },
  concentric_ai: { id: '4502095676', name: 'Concentric AI' },
  connect_sell: { id: '5801651287', name: 'Connect&Sell' },
  covalent: { id: '3548685960', name: 'Covalent Metrology' },
  daniel_shapiro: { id: '7395576762', name: 'Daniel I. Shapiro, M.D., P.C.' },
  dental_care: { id: '2771541197', name: 'Dental Care Associates' },
  digital_security: { id: '4917763878', name: 'Digital Security' },
  dynamic_dental: { id: '4734954125', name: 'Dynamic Dental' },
  epstein: { id: '1300586568', name: 'EPSTEIN' },
  fii: { id: '6837520180', name: 'FII' },
  fluidstack: { id: '2585157054', name: 'Fluidstack' },
  foundation_hair: { id: '9515444472', name: 'Foundation.Hair' },
  ft_jesse: { id: '4443836419', name: 'Ft. Jesse' },
  gentle_dental: { id: '2497090182', name: 'Gentle Dental' },
  great_hill_dental: { id: '6480839212', name: 'Great Hill Dental' },
  hypercatalogue: { id: '9925296449', name: 'HyperCatalogue' },
}

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
    {
      id: 'accounts',
      title: 'Google Ads Account',
      type: 'dropdown',
      layout: 'full',
      options: Object.entries(GOOGLE_ADS_ACCOUNTS).map(([key, account]) => ({
        label: account.name,
        id: key,
        value: account.id,
      })),
      placeholder: 'Select account...',
      required: true,
    },
    {
      id: 'question',
      title: 'Question / Query',
      type: 'long-input',
      layout: 'full',
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
