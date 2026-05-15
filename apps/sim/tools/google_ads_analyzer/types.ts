/**
 * Types for Google Ads Analyzer
 */

export interface GoogleAdsAnalyzerParams {
  /** Raw results array from upstream google_ads_v1 block (JSON string or array) */
  results: string | unknown[]
  /** Optional: original natural language query that produced the results */
  query?: string
  /** Optional: query_type from google_ads_v1 output (campaigns, keywords, search_terms, ads, geographic, etc.) */
  query_type?: string
  /** Optional: tables_used from upstream block */
  tables_used?: string | string[]
  /** Optional: metrics_used from upstream block */
  metrics_used?: string | string[]
  /** Optional: totals object from upstream block */
  totals?: string | Record<string, unknown>
  /** Optional: date range info */
  date_range?: string | { start_date: string; end_date: string }
  /** Optional: account info */
  account?: string | { id: string; name: string }
  /** Analysis depth: summary | detailed | deep (default detailed) */
  depth?: 'summary' | 'detailed' | 'deep'
  /** Focus area: performance | optimization | anomalies | keyword_expansion | budget | all (default all) */
  focus?: 'performance' | 'optimization' | 'anomalies' | 'keyword_expansion' | 'budget' | 'all'
  /** Custom question from the user (optional, overrides default analysis prompt) */
  question?: string
}

export interface AnalyzerKeyFinding {
  title: string
  detail: string
  metric_values?: Record<string, string | number>
  severity?: 'info' | 'warning' | 'critical'
}

export interface AnalyzerRecommendation {
  action: string
  rationale: string
  expected_impact?: string
  priority?: 'high' | 'medium' | 'low'
  target?: string
}

export interface AnalyzerAnomaly {
  entity: string
  metric: string
  observed_value: string | number
  expected_range?: string
  severity: 'info' | 'warning' | 'critical'
  detail: string
}

export interface AnalyzerKeywordSuggestion {
  keyword: string
  match_type: 'EXACT' | 'PHRASE' | 'BROAD'
  rationale: string
  source_term?: string
}

export interface GoogleAdsAnalyzerResponse {
  success: boolean
  summary: string
  key_findings: AnalyzerKeyFinding[]
  recommendations: AnalyzerRecommendation[]
  anomalies: AnalyzerAnomaly[]
  keyword_suggestions?: AnalyzerKeywordSuggestion[]
  computed_metrics?: Record<string, unknown>
  row_count: number
  query_type?: string
  execution_time_ms: number
  raw_llm_response: string
  question?: string
}
