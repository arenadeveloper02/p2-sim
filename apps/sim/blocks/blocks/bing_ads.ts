import { MicrosoftIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

// Bing Ads (Microsoft Advertising) accounts configuration
const BING_ADS_ACCOUNTS = {
  position2_inc: { id: 'C000736328', name: 'Position2 Inc.' },
  '247insider': { id: 'F113ZL2Q', name: '247Insider.com' },
  absolute_software: { id: 'X7721510', name: 'Absolute Software' },
  altula: { id: '1772290', name: 'Altula' },
  amazon_b2b: { id: '41073055', name: 'Amazon B2B' },
  amazon_web_services: { id: '40043856', name: 'Amazon Web Services' },
  antivirusreviews: { id: 'F120FMNQ', name: 'AntiVirusReviews.com' },
  autoarena: { id: 'F119PZDA', name: 'AutoArena.com' },
  bargain_net: { id: 'F120JYA3', name: 'Bargain.net' },
  beauterre: { id: '174103967', name: 'Beauterre' },
  big_g_creative: { id: '173030922', name: 'Big G Creative' },
  bingelocal: { id: 'F120VDGC', name: 'BingeLocal.net' },
  blackfridaystreet: { id: '149228244', name: 'BlackFridayStreet.com' },
  blackfriyay: { id: '150206994', name: 'BlackFriyay.com' },
  botmetric: { id: '71097445', name: 'Botmetric' },
  businessbytes: { id: 'F118NT2T', name: 'BusinessBytes.net' },
  capitalcitynurses: { id: 'F120K5EG', name: 'CapitalCityNurses.com' },
  careadvantage: { id: 'F120L8EF', name: 'CareAdvantage' },
  cellphones_guru: { id: 'F120QC4N', name: 'Cellphones.Guru Bing' },
  comfort_soul: { id: '150375186', name: 'Comfort Soul' },
  cutting_edge_firewood: { id: '151097420', name: 'Cutting Edge Firewood' },
  cybermondaypicks: { id: 'F119JS7T', name: 'CyberMondayPicks.com' },
  dealsdivine: { id: 'F119T3ZT', name: 'DealsDivine.com' },
  dealsfarms: { id: 'F119FJLP', name: 'DealsFarms.com' },
  discoverlocal: { id: 'F120QD4Q', name: 'DiscoverLocal.net' },
  factuia: { id: 'F113ZYXE', name: 'Factuia.com' },
  findanswerstoday: { id: 'F119YZNS', name: 'FindAnswersToday.com' },
  gentle_dental: { id: '151000820', name: 'Gentle Dental' },
  healthatoz: { id: 'F118679G', name: 'HealthAtoZ.net Bing' },
  hunter_fans: { id: 'F120FD4H', name: 'Hunter Fans' },
  infosavant: { id: 'F113NE34', name: 'InfoSavant.net' },
  karrot: { id: '47022035', name: 'Karrot' },
  kitchenaid: { id: '139031647', name: 'KitchenAid' },
  knownemo: { id: 'F119EYGD', name: 'KnowNemo.com' },
  localwizard: { id: 'F120MKTP', name: 'Localwizard.net' },
  mobilesarena: { id: 'F118791H', name: 'MobilesArena.com' },
  offerspod: { id: '150425708', name: 'OffersPod.com' },
  position2mcc: { id: '2482901', name: 'position2mcc' },
  power_wizard: { id: '180047830', name: 'Power Wizard' },
  quorumlabs: { id: '1657574', name: 'QuorumLabs, Inc' },
  reciprocity: { id: '163026540', name: 'Reciprocity Inc.' },
  resultsbee: { id: 'F120SGQF', name: 'Resultsbee.com' },
  rheem_commercial: { id: 'F120MPUQ', name: 'Rheem Commercial-Water' },
  richrelevance: { id: '173097178', name: 'RichRelevance' },
  ruckus: { id: '151000217', name: 'Ruckus' },
  sandstone_diagnostics: { id: '139036399', name: 'Sandstone Diagnostics' },
  seasondeals: { id: 'F1203CJ7', name: 'seasondeals.store' },
  seeknemo_uk: { id: 'F119ZUAP', name: 'SeekNemo.com - UK' },
  au_eventgroove: { id: '2764923', name: 'AU - Eventgroove Products' },
  ca_eventgroove: { id: '2744189', name: 'CA - Eventgroove' },
  uk_eventgroove: { id: '2744166', name: 'UK - Eventgroove' },
  us_eventgroove: { id: '6035', name: 'US - Eventgroove' },
  perforated_paper: { id: '33003078', name: 'Perforated Paper' },
  health_rhythms: { id: '151506406', name: 'Health Rhythms Inc' },
  serenity_acres: { id: '157103079', name: 'Serenity Acres' },
  shoppers_arena: { id: '151003010', name: 'ShoppersArena.net' },
  smart_discounts: { id: '150197206', name: 'SmartDiscounts.net' },
  lg7: { id: '138353435', name: 'LG7' },
  lg8: { id: '138353436', name: 'LG8' },
  lg9: { id: '138353442', name: 'LG9' },
  lg10: { id: '138353461', name: 'LG10' },
  lg11: { id: '138353463', name: 'LG11' },
  lg12: { id: '138353464', name: 'LG12' },
  lg13: { id: '138353466', name: 'LG13' },
  lg14: { id: '138353468', name: 'LG14' },
  lg15: { id: '138353469', name: 'LG15' },
  lg16: { id: '138353472', name: 'LG16' },
  lg17: { id: '138353473', name: 'LG17' },
  lg18: { id: '138353473', name: 'LG18' },
  lg19: { id: '138353446', name: 'LG19' },
  lg20: { id: '138353454', name: 'LG20' },
  lg21: { id: '138353456', name: 'LG21' },
  lg22: { id: '138353458', name: 'LG22' },
  lg23: { id: '138353485', name: 'LG23' },
  lg24: { id: '138353486', name: 'LG24' },
  lg25: { id: '138353492', name: 'LG25' },
  lg26: { id: '138353494', name: 'LG26' },
  lg27: { id: '138353497', name: 'LG27' },
  lg28: { id: '138353499', name: 'LG28' },
  lg29: { id: '138353502', name: 'LG29' },
  lg30: { id: '138353504', name: 'LG30' },
  lifelines_llc: { id: '180411374', name: 'Lifelines LLC' },
  xoriant: { id: '180272408', name: 'Xoriant' },
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
