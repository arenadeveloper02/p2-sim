import { createLogger } from '@sim/logger'
import type { ToolConfig } from '@/tools/types'
import type { GoogleAdsAnalyzerParams, GoogleAdsAnalyzerResponse } from './types'

const logger = createLogger('GoogleAdsAnalyzer')

export const googleAdsAnalyzerTool: ToolConfig<GoogleAdsAnalyzerParams, GoogleAdsAnalyzerResponse> =
  {
    id: 'google_ads_analyzer',
    name: 'Google Ads Analyzer',
    description:
      'Analyzes Google Ads query results and produces structured insights, recommendations, anomalies, and keyword suggestions. Designed to consume output from the google_ads_v1 block.',
    version: '1.0.0',

    params: {
      results: {
        type: 'json',
        required: true,
        visibility: 'user-or-llm',
        description:
          'Results array from the upstream google_ads_v1 block (the `results` field of its output).',
      },
      query: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description: 'The original natural language query that produced the results.',
      },
      query_type: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description:
          'Query type from upstream block (campaigns, keywords, search_terms, ads, geographic, etc.).',
      },
      tables_used: {
        type: 'json',
        required: false,
        visibility: 'user-or-llm',
        description: 'List of GAQL resources used by the upstream query.',
      },
      metrics_used: {
        type: 'json',
        required: false,
        visibility: 'user-or-llm',
        description: 'List of metrics included in the upstream query.',
      },
      totals: {
        type: 'json',
        required: false,
        visibility: 'user-or-llm',
        description: 'Aggregated totals from upstream block.',
      },
      date_range: {
        type: 'json',
        required: false,
        visibility: 'user-or-llm',
        description: 'Date range { start_date, end_date } extracted from the GAQL query.',
      },
      account: {
        type: 'json',
        required: false,
        visibility: 'user-or-llm',
        description: 'Account info { id, name } from upstream block.',
      },
      depth: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description:
          'Analysis depth: summary (top-level only), detailed (default - full breakdown), deep (per-entity diagnostics).',
      },
      focus: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description:
          'Focus area: performance, optimization, anomalies, keyword_expansion, budget, or all (default).',
      },
      question: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description: 'Custom follow-up question to focus the analysis.',
      },
    },

    request: {
      url: () => '/api/google-ads-analyzer',
      method: 'POST',
      headers: () => ({ 'Content-Type': 'application/json' }),
      body: (params: GoogleAdsAnalyzerParams) => ({
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

    transformResponse: async (response: Response) => {
      try {
        if (!response.ok) {
          const errorText = await response.text()
          logger.error('Analyzer response not ok', { status: response.status, errorText })
          throw new Error(
            `Google Ads Analyzer error: ${response.status} ${response.statusText} - ${errorText}`
          )
        }

        const data = (await response.json()) as GoogleAdsAnalyzerResponse & { error?: string }

        if (!data.success) {
          throw new Error(`Google Ads Analyzer error: ${data.error ?? 'Unknown error'}`)
        }

        return { success: true, output: data }
      } catch (error) {
        logger.error('Google Ads Analyzer failed', { error })
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        }
      }
    },
  }
