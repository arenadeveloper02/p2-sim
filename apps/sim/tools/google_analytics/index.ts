/**
 * Google Analytics Tool
 * AI-powered Google Analytics query tool - Following Google Ads v1 pattern
 */

import { createLogger } from '@sim/logger'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GoogleAnalyticsTool')

export const googleAnalyticsTool: ToolConfig = {
  name: 'google_analytics',
  description: 'Query Google Analytics data and website analytics',
  longDescription:
    'The Google Analytics tool allows you to query comprehensive website analytics data including sessions, users, page views, conversions, and other key metrics. Supports flexible date ranges, property filtering, and various query types including traffic sources, user behavior, and conversion analysis.',
  parameters: {
    property: {
      type: 'string',
      description: 'Google Analytics property key (e.g., "website_property")',
      required: true,
    },
    query: {
      type: 'string',
      description: 'Natural language query for Google Analytics data (e.g., "show sessions by country last 7 days")',
      required: true,
    },
  },
  execute: async (params: { property: string; query: string }) => {
    try {
      logger.info('Executing Google Analytics tool', {
        property: params.property,
        query: params.query,
      })

      // Call Google Analytics v1 API
      const response = await fetch('http://localhost:3000/api/google-analytics-v1/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: params.query,
          property: params.property,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Google Analytics API request failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        })
        throw new Error(`Google Analytics API error: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()

      logger.info('Google Analytics tool executed successfully', {
        success: result.success,
        rowCount: result.row_count,
        executionTime: result.execution_time_ms,
      })

      return {
        success: true,
        data: result.data,
        row_count: result.row_count,
        totals: result.totals,
        property: result.property,
        dimensions: result.dimensions,
        metrics: result.metrics,
        dateRanges: result.dateRanges,
        execution_time_ms: result.execution_time_ms,
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      logger.error('Google Analytics tool execution failed', { error: errorMessage })

      return {
        success: false,
        error: errorMessage,
        data: [],
        row_count: 0,
        totals: {},
      }
    }
  },
}
