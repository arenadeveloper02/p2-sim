import { GoogleIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { GoogleAdsResponse } from '@/tools/google_ads/types'
import { env } from '@/lib/env'

// Google Ads accounts configuration
const GOOGLE_ADS_ACCOUNTS = {
  "ami": { id: "7284380454", name: "AMI" },
  "auhi": { id: "4482250764", name: "AUHI" },
  "acalvio": { id: "9011732980", name: "Acalvio" },
  "altula": { id: "1160331216", name: "Altula" },
  "arenaplay": { id: "1830946644", name: "Arenaplay" },
  "cpic": { id: "1757492986", name: "CPIC" },
  "capitalcitynurses": { id: "8395621144", name: "CapitalCityNurses.com" },
  "careadvantage": { id: "9059182052", name: "CareAdvantage" },
  "chancey_reynolds": { id: "7098393346", name: "Chancey & Reynolds" },
  "chevron_july": { id: "2654484646", name: "Chevron-July-01" },
  "concentric_ai": { id: "4502095676", name: "Concentric AI" },
  "connect_sell": { id: "5801651287", name: "Connect&Sell" },
  "covalent": { id: "3548685960", name: "Covalent Metrology" },
  "daniel_shapiro": { id: "7395576762", name: "Daniel I. Shapiro, M.D., P.C." },
  "dental_care": { id: "2771541197", name: "Dental Care Associates" },
  "digital_security": { id: "4917763878", name: "Digital Security" },
  "dynamic_dental": { id: "4734954125", name: "Dynamic Dental" },
  "epstein": { id: "1300586568", name: "EPSTEIN" },
  "fii": { id: "6837520180", name: "FII" },
  "fluidstack": { id: "2585157054", name: "Fluidstack" },
  "foundation_hair": { id: "9515444472", name: "Foundation.Hair" },
  "ft_jesse": { id: "4443836419", name: "Ft. Jesse" },
  "gentle_dental": { id: "2497090182", name: "Gentle Dental" },
  "great_hill_dental": { id: "6480839212", name: "Great Hill Dental" },
  "hypercatalogue": { id: "9925296449", name: "HyperCatalogue" }
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
      id: 'query_type',
      title: 'Query Type',
      type: 'dropdown',
      layout: 'half',
      options: [
        { label: 'Campaign Performance', id: 'campaigns' },
        { label: 'Performance Analysis', id: 'performance' },
        { label: 'Cost Analysis', id: 'cost' },
        { label: 'Keyword Analysis', id: 'keywords' },
      ],
      value: () => 'campaigns',
      required: true,
    },
    {
      id: 'period_type',
      title: 'Time Period',
      type: 'dropdown',
      layout: 'half',
      options: [
        { label: 'Last 7 Days', id: 'last_7_days' },
        { label: 'Last 15 Days', id: 'last_15_days' },
        { label: 'Last 30 Days', id: 'last_30_days' },
        { label: 'This Month', id: 'this_month' },
        { label: 'Last Month', id: 'last_month' },
        { label: 'Custom Range', id: 'custom' },
      ],
      value: () => 'last_30_days',
      required: true,
    },
    {
      id: 'accounts',
      title: 'Google Ads Account',
      type: 'dropdown',
      layout: 'half',
      options: Object.entries(GOOGLE_ADS_ACCOUNTS).map(([key, account]) => ({
        label: account.name,
        id: key,
        value: account.id,
      })),
      placeholder: 'Select account...',
      required: true,
    },
    {
      id: 'natural_query',
      title: 'Natural Language Query (Optional)',
      type: 'long-input',
      layout: 'full',
      placeholder: 'e.g., "Show me CareAdvantage and Acalvio performance for last 30 days"',
      rows: 3,
    },
    {
      id: 'output_format',
      title: 'Output Format',
      type: 'dropdown',
      layout: 'half',
      options: [
        { label: 'Detailed Report', id: 'detailed' },
        { label: 'Summary Only', id: 'summary' },
        { label: 'CSV Format', id: 'csv' },
        { label: 'Chart Data', id: 'chart' },
      ],
      value: () => 'detailed',
    },
    {
      id: 'sort_by',
      title: 'Sort By',
      type: 'dropdown',
      layout: 'half',
      options: [
        { label: 'Cost (Highest First)', id: 'cost_desc' },
        { label: 'Clicks (Highest First)', id: 'clicks_desc' },
        { label: 'Impressions (Highest First)', id: 'impressions_desc' },
        { label: 'Conversions (Highest First)', id: 'conversions_desc' },
        { label: 'Campaign Name (A-Z)', id: 'name_asc' },
      ],
      value: () => 'cost_desc',
    },
  ],
  tools: {
    access: ['google_ads_query'],
    config: {
      tool: () => 'google_ads_query',
      params: (params) => ({
        query_type: params.query_type,
        accounts: params.accounts,
        period_type: params.period_type,
        natural_query: params.natural_query,
        output_format: params.output_format,
        sort_by: params.sort_by,
      }),
    },
  },
  inputs: {
    query_type: { type: 'string', description: 'Type of Google Ads query to perform' },
    accounts: { type: 'string', description: 'Selected Google Ads account' },
    period_type: { type: 'string', description: 'Time period for the query' },
    natural_query: { type: 'string', description: 'Optional natural language query' },
    output_format: { type: 'string', description: 'Output format for results' },
    sort_by: { type: 'string', description: 'Sort criteria for results' },
  },
  outputs: {
    query: { type: 'string', description: 'Executed query' },
    results: { type: 'json', description: 'Google Ads campaign data and analytics' },
    grand_totals: { type: 'json', description: 'Aggregated totals across all accounts' },
    data_availability: { type: 'json', description: 'Data availability information' },
  },
}