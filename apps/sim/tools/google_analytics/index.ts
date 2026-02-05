import { createLogger } from '@sim/logger'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GoogleAnalyticsQuery')

interface GoogleAnalyticsQueryParams {
  query: string
  property: string
}

interface GoogleAnalyticsV1Response {
  success: boolean
  data: {
    rows: any[]
    row_count: number
    total_rows: number
    totals?: Record<string, number>
  }
  query: string
  metadata: {
    requestId: string
    property: string
    dimensions: string[]
    metrics: string[]
    dateRanges: Array<{
      startDate: string
      endDate: string
    }>
  }
  error?: string
}

export const googleAnalyticsQueryTool: ToolConfig<GoogleAnalyticsQueryParams, any> = {
  id: 'google_analytics_query',
  name: 'Google Analytics Query',
  description: 'Query Google Analytics 4 data using natural language',
  version: '1.0.0',

  params: {
    query: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Natural language query for Google Analytics data (e.g., "show daily active users last 7 days", "top pages this month")',
    },
    property: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'GA4 Property ID (e.g., properties/123456789)',
    },
  },

  request: {
    url: () => '/api/google-analytics-v1/query',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: GoogleAnalyticsQueryParams) => ({
      query: params.query,
      property: params.property,
    }),
  },

  transformResponse: async (response: Response, params?: GoogleAnalyticsQueryParams) => {
    try {
      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Response not ok', { status: response.status, errorText })
        throw new Error(
          `Google Analytics API error: ${response.status} ${response.statusText} - ${errorText}`
        )
      }

      const result = await response.json()
      logger.info('Google Analytics query successful', {
        rowCount: result.data?.row_count || 0,
        property: params?.property,
      })

      return result
    } catch (error) {
      logger.error('Failed to process Google Analytics response', { error })
      throw error
    }
  },
}
