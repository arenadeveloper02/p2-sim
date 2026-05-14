/**
 * Server-side types for the Google Ads Analyzer route
 */

export interface AnalyzerRequestBody {
  results: unknown
  query?: string
  query_type?: string
  tables_used?: string | string[]
  metrics_used?: string | string[]
  totals?: unknown
  date_range?: unknown
  account?: unknown
  depth?: 'summary' | 'detailed' | 'deep'
  focus?: 'performance' | 'optimization' | 'anomalies' | 'keyword_expansion' | 'budget' | 'all'
  question?: string
}

export interface AnalyzerStructuredOutput {
  summary?: string
  key_findings?: Array<{
    title: string
    detail: string
    metric_values?: Record<string, string | number>
    severity?: 'info' | 'warning' | 'critical'
  }>
  recommendations?: Array<{
    action: string
    rationale: string
    expected_impact?: string
    priority?: 'high' | 'medium' | 'low'
    target?: string
  }>
  anomalies?: Array<{
    entity: string
    metric: string
    observed_value: string | number
    expected_range?: string
    severity: 'info' | 'warning' | 'critical'
    detail: string
  }>
  keyword_suggestions?: Array<{
    keyword: string
    match_type: 'EXACT' | 'PHRASE' | 'BROAD'
    rationale: string
    source_term?: string
  }>
  computed_metrics?: Record<string, unknown>
}
