import { ChartBarIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { ToolResponse } from '@/tools/types'

interface IndustryBenchmarkResponse extends ToolResponse {
  output: {
    client: string
    industry: string
    demographics: {
      targetAgeGroups: string[]
      targetIncome: string
      primeLocations: string[]
      genderSplit: string
    }
    googleAdsPerformance: {
      ctr: string
      cpc: string
      conversionRate: string
      cost: string
      impressions: number
      clicks: number
      conversions: number
    }
    industryBenchmarks: {
      avgCtr: string
      avgCpc: string
      avgConversionRate: string
      topPerformerCtr: string
    }
    performanceGaps: {
      ctr: string
      cpc: string
      conversionRate: string
    }
    locationRecommendations: Array<{
      location: string
      reason: string
      suggestedBudget: string
    }>
    abTestingRecommendations: Array<{
      test: string
      variantA: string
      variantB: string
      expectedImpact: string
    }>
    demographicInsights: string[]
    competitorInsights: string[]
  }
}

export const IndustryBenchmarkBlock: BlockConfig<IndustryBenchmarkResponse> = {
  type: 'industry_benchmark',
  name: 'Industry Benchmark',
  description: 'Analyze performance vs industry benchmarks',
  longDescription:
    'Compare your Google Ads performance against industry benchmarks. Get AI-powered insights on demographics, locations, A/B testing recommendations, and competitor analysis. Perfect for CEO dashboards and executive reporting.',
  docsLink: 'https://docs.sim.ai/blocks/industry-benchmark',
  category: 'blocks',
  bgColor: '#9333EA',
  icon: ChartBarIcon,
  subBlocks: [
    {
      id: 'clientAccount',
      title: 'Client Account',
      type: 'dropdown',
      layout: 'full',
      options: [
        { label: 'AMI', id: 'ami' },
        { label: 'Heartland', id: 'heartland' },
        { label: 'NHI', id: 'nhi' },
        { label: 'OIC-Culpeper', id: 'oic_culpeper' },
        { label: 'ODC-AL', id: 'odc_al' },
        { label: 'CPIC', id: 'cpic' },
        { label: 'IDI-FL', id: 'idi_fl' },
        { label: 'SMI', id: 'smi' },
        { label: 'Holmdel-NJ', id: 'holmdel_nj' },
        { label: 'Ft. Jesse', id: 'ft_jesse' },
        { label: 'UD', id: 'ud' },
        { label: 'Wolf River', id: 'wolf_river' },
        { label: 'Phoenix Rehab', id: 'phoenix_rehab' },
        { label: 'AU - Eventgroove Products', id: 'au_eventgroove_products' },
        { label: 'US - Eventgroove Products', id: 'us_eventgroove_products' },
        { label: 'CA - Eventgroove Products', id: 'ca_eventgroove_products' },
        { label: 'Perforated Paper', id: 'perforated_paper' },
        { label: 'UK - Eventgroove Products', id: 'uk_eventgroove_products' },
        { label: 'Monster Transmission', id: 'monster_transmission' },
        { label: 'CareAdvantage', id: 'careadvantage' },
        { label: 'CapitalCityNurses.com', id: 'capitalcitynurses' },
        { label: 'Silverlininghealthcare.com', id: 'silverlininghealthcare' },
        { label: 'Youngshc.com', id: 'youngshc' },
        { label: 'Nova HHC', id: 'nova_hhc' },
        { label: 'Inspire Aesthetics', id: 'inspire_aesthetics' },
        { label: 'Mosca Plastic Surgery', id: 'mosca_plastic_surgery' },
        { label: 'Marietta Plastic Surgery', id: 'marietta_plastic_surgery' },
        { label: 'Daniel I. Shapiro, M.D., P.C.', id: 'daniel_shapiro' },
        { label: 'Southern Coastal', id: 'southern_coastal' },
        {
          label: 'Plastic Surgery Center of Hampton Roads',
          id: 'plastic_surgery_center_hr',
        },
        { label: 'EPSTEIN', id: 'epstein' },
        { label: 'Covalent Metrology', id: 'covalent_metrology' },
        { label: 'Gentle Dental', id: 'gentle_dental' },
        { label: 'Great Hill Dental', id: 'great_hill_dental' },
        { label: 'Dynamic Dental', id: 'dynamic_dental' },
        { label: 'Great Lakes', id: 'great_lakes' },
        { label: 'Southern Connecticut Dental Group', id: 'southern_ct_dental' },
        { label: 'Dental Care Associates', id: 'dental_care_associates' },
        { label: 'Service Air Eastern Shore', id: 'service_air_eastern_shore' },
        { label: 'Chancey & Reynolds', id: 'chancey_reynolds' },
        { label: 'Howell Chase', id: 'howell_chase' },
      ],
      placeholder: 'Select client account...',
      required: true,
    },
    {
      id: 'googleAdsData',
      title: 'Google Ads Data',
      type: 'long-input',
      layout: 'full',
      placeholder: 'Connect Google Ads block output (e.g., <google_ads.results>)',
      description: 'Connect the output from a Google Ads block to analyze performance',
      required: true,
    },
    {
      id: 'timePeriod',
      title: 'Time Period',
      type: 'dropdown',
      layout: 'half',
      options: [
        { label: 'Last 7 days', id: 'last_7_days' },
        { label: 'Last 30 days', id: 'last_30_days' },
        { label: 'Last 90 days', id: 'last_90_days' },
        { label: 'This month', id: 'this_month' },
        { label: 'Last month', id: 'last_month' },
      ],
      value: () => 'last_30_days',
    },
    {
      id: 'includeCompetitorAnalysis',
      title: 'Include Competitor Analysis',
      type: 'switch',
      layout: 'half',
      defaultValue: true,
    },
    {
      id: 'exaApiKey',
      title: 'Exa API Key',
      type: 'short-input',
      layout: 'full',
      placeholder: 'Enter your Exa API key for web research',
      password: true,
      required: true,
      description: 'Used to search for industry benchmarks and competitor data',
    },
    {
      id: 'openaiApiKey',
      title: 'OpenAI API Key',
      type: 'short-input',
      layout: 'full',
      placeholder: 'Enter your OpenAI API key for AI analysis',
      password: true,
      required: true,
      description: 'Used for AI-powered insights and recommendations',
    },
  ],
  tools: {
    access: ['industry_benchmark_analyze'],
    config: {
      tool: () => 'industry_benchmark_analyze',
      params: (params) => ({
        clientAccount: params.clientAccount,
        googleAdsData: params.googleAdsData,
        timePeriod: params.timePeriod || 'last_30_days',
        includeCompetitorAnalysis: params.includeCompetitorAnalysis ?? true,
        exaApiKey: params.exaApiKey,
        openaiApiKey: params.openaiApiKey,
      }),
    },
  },
  inputs: {
    clientAccount: {
      type: 'string',
      description: 'Client account identifier',
    },
    googleAdsData: {
      type: 'json',
      description: 'Google Ads performance data',
    },
    timePeriod: {
      type: 'string',
      description: 'Analysis time period',
    },
    includeCompetitorAnalysis: {
      type: 'boolean',
      description: 'Whether to include competitor analysis',
    },
    exaApiKey: {
      type: 'string',
      description: 'Exa API key for web research',
    },
    openaiApiKey: {
      type: 'string',
      description: 'OpenAI API key for AI analysis',
    },
  },
  outputs: {
    client: { type: 'string', description: 'Client name' },
    industry: { type: 'string', description: 'Industry vertical' },
    demographics: { type: 'json', description: 'Target demographic data' },
    googleAdsPerformance: { type: 'json', description: 'Current Google Ads metrics' },
    industryBenchmarks: { type: 'json', description: 'Industry average benchmarks' },
    performanceGaps: { type: 'json', description: 'Performance vs benchmarks' },
    locationRecommendations: { type: 'json', description: 'Location targeting suggestions' },
    abTestingRecommendations: { type: 'json', description: 'A/B testing ideas' },
    demographicInsights: { type: 'json', description: 'Demographic analysis' },
    competitorInsights: { type: 'json', description: 'Competitor intelligence' },
  },
}
