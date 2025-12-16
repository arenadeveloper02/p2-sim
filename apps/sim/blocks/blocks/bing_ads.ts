import { MicrosoftIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

// Bing Ads (Microsoft Advertising) accounts configuration
const BING_ADS_ACCOUNTS = {
  position2_inc: { id: 'C000736328', name: 'Position2 Inc.' },
  '247insider': { id: 'F113ZL2Q', name: '247Insider.com' },
  absolute_software: { id: 'X7721510', name: 'Absolute Software' },
  altula: { id: 'X7854216', name: 'Altula' },
  amazon_b2b: { id: 'B011MVGU', name: 'Amazon B2B' },
  amazon_web_services: { id: 'B010UE8C', name: 'Amazon Web Services' },
  antivirusreviews: { id: 'F120FMNQ', name: 'AntiVirusReviews.com' },
  autoarena: { id: 'F119PZDA', name: 'AutoArena.com' },
  bargain_net: { id: 'F120JYA3', name: 'Bargain.net' },
  beauterre: { id: 'F143RVD7', name: 'Beauterre' },
  big_g_creative: { id: 'F142Q248', name: 'Big G Creative' },
  bingelocal: { id: 'F120VDGC', name: 'BingeLocal.net' },
  blackfridaystreet: { id: 'F118RML5', name: 'BlackFridayStreet.com' },
  blackfriyay: { id: 'F119W1DJ', name: 'BlackFriyay.com' },
  botmetric: { id: 'B041R11F', name: 'Botmetric' },
  businessbytes: { id: 'F118NT2T', name: 'BusinessBytes.net' },
  capitalcitynurses: { id: 'F120K5EG', name: 'CapitalCityNurses.com' },
  careadvantage: { id: 'F120L8EF', name: 'CareAdvantage' },
  cellphones_guru: { id: 'F120QC4N', name: 'Cellphones.Guru Bing' },
  comfort_soul: { id: 'F1196AW7', name: 'Comfort Soul' },
  cutting_edge_firewood: { id: 'F120JLPM', name: 'Cutting Edge Firewood' },
  cybermondaypicks: { id: 'F119JS7T', name: 'CyberMondayPicks.com' },
  dealsdivine: { id: 'F119T3ZT', name: 'DealsDivine.com' },
  dealsfarms: { id: 'F119FJLP', name: 'DealsFarms.com' },
  discoverlocal: { id: 'F120QD4Q', name: 'DiscoverLocal.net' },
  factuia: { id: 'F113ZYXE', name: 'Factuia.com' },
  findanswerstoday: { id: 'F119YZNS', name: 'FindAnswersToday.com' },
  gentle_dental: { id: 'F12086M4', name: 'Gentle Dental' },
  healthatoz: { id: 'F118679G', name: 'HealthAtoZ.net Bing' },
  hunter_fans: { id: 'F120FD4H', name: 'Hunter Fans' },
  infosavant: { id: 'F113NE34', name: 'InfoSavant.net' },
  karrot: { id: 'B017TFLL', name: 'Karrot' },
  kitchenaid: { id: 'F108SUNH', name: 'KitchenAid' },
  knownemo: { id: 'F119EYGD', name: 'KnowNemo.com' },
  localwizard: { id: 'F120MKTP', name: 'Localwizard.net' },
  mobilesarena: { id: 'F118791H', name: 'MobilesArena.com' },
  offerspod: { id: 'F119BMSP', name: 'OffersPod.com' },
  position2mcc: { id: 'X7420892', name: 'position2mcc' },
  power_wizard: { id: 'F149WSPC', name: 'Power Wizard' },
  quorumlabs: { id: 'X0411997', name: 'QuorumLabs, Inc' },
  reciprocity: { id: 'F132WPW3', name: 'Reciprocity Inc.' },
  resultsbee: { id: 'F120SGQF', name: 'Resultsbee.com' },
  rheem_commercial: { id: 'F120MPUQ', name: 'Rheem Commercial-Water' },
  richrelevance: { id: 'F142WJ32', name: 'RichRelevance' },
  ruckus: { id: 'F1209U1D', name: 'Ruckus' },
  sandstone_diagnostics: { id: 'F108DPJE', name: 'Sandstone Diagnostics' },
  seasondeals: { id: 'F1203CJ7', name: 'seasondeals.store' },
  seeknemo_uk: { id: 'F119ZUAP', name: 'SeekNemo.com - UK' },
}

export interface BingAdsQueryResponse {
  success: boolean
  output: {
    data: Array<Record<string, any>>
    account_id: string
    account_name: string
    query: string
    date_range?: {
      start: string
      end: string
    }
  }
  error?: string
}

export const BingAdsBlock: BlockConfig<BingAdsQueryResponse> = {
  type: 'bing_ads',
  name: 'Bing Ads',
  description: 'Query Microsoft Advertising (Bing Ads) data with natural language',
  longDescription:
    'Connect to Microsoft Advertising (Bing Ads) API and query campaign performance, ad metrics, and account insights using natural language. Supports all Position2 Bing Ads accounts with AI-powered query parsing.',
  docsLink: 'https://docs.sim.ai/blocks/bing-ads',
  category: 'tools',
  bgColor: '#00A4EF',
  icon: MicrosoftIcon,
  subBlocks: [
    {
      id: 'account',
      title: 'Bing Ads Account',
      type: 'dropdown',
      options: Object.entries(BING_ADS_ACCOUNTS).map(([key, account]) => ({
        label: account.name,
        id: key,
        value: account.id,
      })),
      placeholder: 'Select Bing Ads account...',
      required: true,
    },
    {
      id: 'query',
      title: 'Question / Query',
      type: 'long-input',
      placeholder:
        'Ask any question about Bing Ads data, e.g., "Show me campaign performance for last 30 days", "What are my top spending campaigns this month?", "How many conversions did I get last week?"',
      rows: 3,
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `You are a Bing Ads (Microsoft Advertising) query assistant. Help users create effective questions for Bing Ads data analysis.

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
- Clicks, Impressions, Spend, Conversions
- CTR (Click-through rate), CPC (Cost per click)
- Conversion rate, Cost per conversion
- Impression share, Average position
- ROAS (Return on ad spend)

### TIME PERIODS
- Last 7/15/30 days
- This/Last month, This/Last week
- Yesterday, Today
- Specific date ranges

Generate a clear, specific question about Bing Ads performance based on the user's request.`,
      },
    },
  ],
  tools: {
    access: ['bing_ads_query'],
    config: {
      tool: () => 'bing_ads_query',
      params: (params) => ({
        account: params.account,
        query: params.query,
      }),
    },
  },
  inputs: {
    account: { type: 'string', description: 'Bing Ads account identifier' },
    query: { type: 'string', description: 'Natural language query from user chat' },
  },
  outputs: {
    data: {
      type: 'json',
      description: 'Bing Ads performance data',
    },
    account_id: {
      type: 'string',
      description: 'Bing Ads account ID',
    },
    account_name: {
      type: 'string',
      description: 'Bing Ads account name',
    },
    query: {
      type: 'string',
      description: 'Original query',
    },
  },
}
