import { GoogleIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import type { GoogleAdsAnalyzerResponse } from '@/tools/google_ads_analyzer'

interface GoogleAdsAnalyzerOutput {
  success: boolean
  output: GoogleAdsAnalyzerResponse
}

export const GoogleAdsAnalyzerBlock: BlockConfig<GoogleAdsAnalyzerOutput> = {
  type: 'google_ads_analyzer',
  name: 'Google Ads Analyzer',
  description: 'Analyze Google Ads query results into structured insights and recommendations',
  longDescription:
    'Specialized analyzer block for Google Ads. Consumes the `results` array from a Google Ads V1 block and returns a data-grounded summary, key findings, anomalies, recommendations, and (for search-term queries) keyword expansion suggestions. Designed for ads-platform analytics where accuracy matters - every claim is anchored to actual numbers in the data.',
  docsLink: 'https://docs.sim.ai/tools/google-ads-analyzer',
  category: 'tools',
  bgColor: '#1a73e8',
  icon: GoogleIcon,
  subBlocks: [
    {
      id: 'results',
      title: 'Results',
      type: 'long-input',
      placeholder: 'Connect the `results` output of a Google Ads V1 block here.',
      rows: 4,
      required: true,
      description:
        'The `results` array from the upstream google_ads_v1 block. Drag-and-drop the output reference.',
    },
    {
      id: 'query',
      title: 'Original Query (optional)',
      type: 'short-input',
      placeholder: 'e.g., "campaign performance last 30 days"',
      required: false,
    },
    {
      id: 'query_type',
      title: 'Query Type (optional)',
      type: 'short-input',
      placeholder: 'campaigns | keywords | search_terms | ads | geographic | shopping | ...',
      required: false,
    },
    {
      id: 'date_range',
      title: 'Date Range (optional)',
      type: 'short-input',
      placeholder: '{ "start_date": "2026-04-08", "end_date": "2026-05-07" }',
      required: false,
    },
    {
      id: 'account',
      title: 'Account (optional)',
      type: 'short-input',
      placeholder: '{ "id": "1234567890", "name": "Account Name" }',
      required: false,
    },
    {
      id: 'totals',
      title: 'Totals (optional)',
      type: 'long-input',
      rows: 2,
      placeholder: 'Aggregate totals object from the upstream block, if available.',
      required: false,
    },
    {
      id: 'depth',
      title: 'Analysis Depth',
      type: 'dropdown',
      options: [
        { id: 'summary', label: 'Summary', value: 'summary' },
        { id: 'detailed', label: 'Detailed (default)', value: 'detailed' },
        { id: 'deep', label: 'Deep (per-entity)', value: 'deep' },
      ],
      required: false,
    },
    {
      id: 'focus',
      title: 'Focus Area',
      type: 'dropdown',
      options: [
        { id: 'all', label: 'All (default)', value: 'all' },
        { id: 'performance', label: 'Performance', value: 'performance' },
        { id: 'optimization', label: 'Optimization', value: 'optimization' },
        { id: 'anomalies', label: 'Anomalies', value: 'anomalies' },
        { id: 'keyword_expansion', label: 'Keyword Expansion', value: 'keyword_expansion' },
        { id: 'budget', label: 'Budget', value: 'budget' },
      ],
      required: false,
    },
    {
      id: 'question',
      title: 'Follow-up Question (optional)',
      type: 'long-input',
      rows: 2,
      placeholder:
        'e.g., "Which keywords should we pause?" or "Where should we reallocate budget?"',
      required: false,
    },
  ],
  tools: {
    access: ['google_ads_analyzer'],
    config: {
      tool: () => 'google_ads_analyzer',
      params: (params) => ({
        results: params.results,
        query: params.query,
        query_type: params.query_type,
        tables_used: params.tables_used,
        metrics_used: params.metrics_used,
        totals: params.totals,
        date_range: params.date_range,
        account: params.account,
        depth: params.depth ?? 'detailed',
        focus: params.focus ?? 'all',
        question: params.question,
      }),
    },
  },
  inputs: {
    results: { type: 'json', description: 'Results array from the upstream Google Ads V1 block.' },
    query: { type: 'string', description: 'Original natural-language query.' },
    query_type: { type: 'string', description: 'Query type detected by the upstream block.' },
    tables_used: { type: 'json', description: 'Tables used by the upstream query.' },
    metrics_used: { type: 'json', description: 'Metrics used by the upstream query.' },
    totals: { type: 'json', description: 'Aggregate totals from the upstream block.' },
    date_range: { type: 'json', description: 'Date range of the upstream query.' },
    account: { type: 'json', description: 'Account info { id, name }.' },
    depth: { type: 'string', description: 'summary | detailed | deep' },
    focus: {
      type: 'string',
      description: 'performance | optimization | anomalies | keyword_expansion | budget | all',
    },
    question: { type: 'string', description: 'Optional follow-up question.' },
  },
  outputs: {
    success: { type: 'boolean', description: 'Whether the analysis succeeded.' },
    summary: { type: 'string', description: 'Executive summary grounded in the data.' },
    key_findings: { type: 'json', description: 'List of structured findings with severity.' },
    recommendations: {
      type: 'json',
      description: 'List of prioritized, ads-specific recommended actions.',
    },
    anomalies: {
      type: 'json',
      description: 'Detected anomalies with entity, metric and severity.',
    },
    keyword_suggestions: {
      type: 'json',
      description: 'New keyword ideas (only for search_terms / keyword_expansion focus).',
    },
    computed_metrics: {
      type: 'json',
      description: 'Pre-computed aggregate metrics (cost, CTR, CPC, CPA, ROAS, etc.).',
    },
    row_count: { type: 'number', description: 'Number of rows analyzed.' },
    query_type: { type: 'string', description: 'Echoed query_type.' },
    execution_time_ms: { type: 'number', description: 'Total analysis time.' },
  },
}
