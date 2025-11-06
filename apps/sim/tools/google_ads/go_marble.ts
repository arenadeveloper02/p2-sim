import { createLogger } from '@/lib/logs/console/logger'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GoogleAdsGoMarble')

interface GoogleAdsGoMarbleParams {
  tool: 'run_gaql' | 'list_accounts' | 'keyword_planner'
  customer_id?: string
  query?: string
  manager_id?: string
  keywords?: string[]
  page_url?: string
  start_year?: number
  start_month?: string
  end_year?: number
  end_month?: string
}

export const googleAdsGoMarbleTool: ToolConfig<GoogleAdsGoMarbleParams, any> = {
  id: 'google_ads_go_marble',
  name: 'Google Ads Go Marble',
  description:
    'Execute direct GAQL queries on Google Ads API without AI processing. Python-style implementation for raw API access.',
  version: '1.0.0',

  params: {
    tool: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Tool to execute: run_gaql, list_accounts, or keyword_planner',
    },
    customer_id: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Google Ads customer ID (required for run_gaql and keyword_planner)',
    },
    query: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'GAQL query string (required for run_gaql)',
    },
    manager_id: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Manager account ID (optional)',
    },
    keywords: {
      type: 'json',
      required: false,
      visibility: 'user-or-llm',
      description: 'Array of keywords for keyword planner',
    },
    page_url: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Page URL for keyword planner',
    },
    start_year: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Start year for keyword planner date range',
    },
    start_month: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Start month for keyword planner date range',
    },
    end_year: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'End year for keyword planner date range',
    },
    end_month: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'End month for keyword planner date range',
    },
  },

  request: {
    url: () => '/api/google-ads-go-marble/query',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: GoogleAdsGoMarbleParams) => params,
  },

  transformResponse: async (response: Response, params?: GoogleAdsGoMarbleParams) => {
    try {
      logger.info('Processing Go Marble response', {
        status: response.status,
        tool: params?.tool,
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Go Marble response not ok', { status: response.status, errorText })
        throw new Error(`Go Marble API error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json()
      logger.info('Go Marble response data received', {
        dataKeys: Object.keys(data),
        hasResults: !!data.results || !!data.accounts || !!data.keyword_ideas,
      })

      if (data.error) {
        logger.error('Go Marble API returned error', { error: data.error })
        throw new Error(data.error)
      }

      return {
        success: true,
        output: data,
      }
    } catch (error) {
      logger.error('Error processing Go Marble response', { error })
      throw error
    }
  },
}
