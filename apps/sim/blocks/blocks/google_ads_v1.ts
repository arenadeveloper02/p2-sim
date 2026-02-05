import { GoogleIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

// Google Ads accounts configuration (same as original)
export const GOOGLE_ADS_V1_ACCOUNTS: Record<string, { id: string; name: string }> = {
  ami: { id: '7284380454', name: 'AMI' },
  bd_engine_brake: { id: '8577930930', name: '1369614 B.C. LTD. (BD Engine Brake)' },
  au_eventgroove_products: { id: '3365918329', name: 'AU - Eventgroove Products' },
  ca_eventgroove_products: { id: '5197514377', name: 'CA - Eventgroove Products' },
  capitalcitynurses: { id: '8395621144', name: 'CapitalCityNurses.com' },
  careadvantage: { id: '9059182052', name: 'CareAdvantage' },
  chancey_reynolds: { id: '7098393346', name: 'Chancey & Reynolds' },
  covalent_metrology: { id: '3548685960', name: 'Covalent Metrology' },
  cpic: { id: '1757492986', name: 'CPIC' },
  daniel_shapiro: { id: '7395576762', name: 'Daniel I. Shapiro, M.D., P.C.' },
  dj_precision_machine: { id: '6438492741', name: 'D&J Precision Machine LLC' },
  dental_care_associates: { id: '2771541197', name: 'Dental Care Associates' },
  dynamic_dental: { id: '4734954125', name: 'Dynamic Dental' },
  epstein: { id: '1300586568', name: 'EPSTEIN' },
  ft_jesse: { id: '4443836419', name: 'Ft. Jesse' },
  gentle_dental: { id: '2497090182', name: 'Gentle Dental' },
  great_hill_dental: { id: '6480839212', name: 'Great Hill Dental' },
  great_lakes: { id: '9925296449', name: 'Great Lakes' },
  garramone_ralph: { id: '1472407899', name: 'Garramone, Ralph' },
  heartland: { id: '4479015711', name: 'Heartland' },
  holmdel_nj: { id: '3507263995', name: 'Holmdel-NJ' },
  howell_chase: { id: '1890712343', name: 'Howell Chase' },
  idi_fl: { id: '1890773395', name: 'IDI-FL' },
  inspire_aesthetics: { id: '1887900641', name: 'Inspire Aesthetics' },
  marietta_plastic_surgery: { id: '6374556990', name: 'Marietta Plastic Surgery' },
  monster_transmission: { id: '2680354698', name: 'Monster Transmission' },
  mosca_plastic_surgery: { id: '8687457378', name: 'Mosca Plastic Surgery' },
  nhi: { id: '2998186794', name: 'NHI' },
  nova_hhc: { id: '9279793056', name: 'Nova HHC' },
  odc_al: { id: '1749359003', name: 'ODC-AL' },
  oic_culpeper: { id: '8226685899', name: 'OIC-Culpeper' },
  perforated_paper: { id: '8909188371', name: 'Perforated Paper' },
  riccobene: { id: '2848955239', name: 'Riccobene' },
  phoenix_rehab: { id: '4723354550', name: 'Phoenix Rehab (NEW - WM Invoices)' },
  plastic_surgery_center_hr: { id: '1105892184', name: 'Plastic Surgery Center of Hampton Roads' },
  service_air_eastern_shore: { id: '8139983849', name: 'Service Air Eastern Shore' },
  silverlininghealthcare: { id: '4042307092', name: 'Silverlininghealthcare.com' },
  smi: { id: '9960845284', name: 'SMI' },
  southern_coastal: { id: '2048733325', name: 'Southern Coastal' },
  southern_ct_dental: { id: '7842729643', name: 'Southern Connecticut Dental Group' },
  ud: { id: '8270553905', name: 'UD' },
  uk_eventgroove_products: { id: '7662673578', name: 'UK - Eventgroove Products' },
  us_eventgroove_products: { id: '4687328820', name: 'US - Eventgroove Products' },
  wolf_river: { id: '6445143850', name: 'Wolf River' },
  youngshc: { id: '3240333229', name: 'Youngshc.com' },
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
    // Google Ads Account (basic mode - dropdown)
    {
      id: 'accounts',
      title: 'Google Ads Account',
      type: 'dropdown',
      options: Object.entries(GOOGLE_ADS_V1_ACCOUNTS).map(([key, account]) => ({
        label: account.name,
        id: key,
        value: key,
      })),
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
