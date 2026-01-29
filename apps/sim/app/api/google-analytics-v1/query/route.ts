/**
 * Google Analytics v1 API Route
 * Simplified, AI-powered Google Analytics query endpoint - Following Google Ads v1 pattern
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'
import { GA4_PROPERTIES } from './constants'
import { makeGA4Request } from './ga4-api'
import { generateGA4Query } from './query-generation'
import { processResults } from './result-processing'
import type { GoogleAnalyticsV1Request } from './types'

const logger = createLogger('GoogleAnalyticsV1API')

/**
 * Convert date preset to actual date string
 */
function getDateFromPreset(preset: string, type: 'start' | 'end'): string {
  const today = new Date()
  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  switch (preset) {
    case 'today':
      return formatDate(today)

    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)
      return formatDate(yesterday)
    }

    case 'last_7_days': {
      // Last 7 days excludes today, ends on yesterday
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)
      if (type === 'end') return formatDate(yesterday)
      const start = new Date(yesterday)
      start.setDate(yesterday.getDate() - 6)
      return formatDate(start)
    }

    case 'last_30_days': {
      // Last 30 days excludes today, ends on yesterday
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)
      if (type === 'end') return formatDate(yesterday)
      const start = new Date(yesterday)
      start.setDate(yesterday.getDate() - 29)
      return formatDate(start)
    }

    case 'last_90_days': {
      // Last 90 days excludes today, ends on yesterday
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)
      if (type === 'end') return formatDate(yesterday)
      const start = new Date(yesterday)
      start.setDate(yesterday.getDate() - 89)
      return formatDate(start)
    }

    case 'this_week': {
      const dayOfWeek = today.getDay()
      const start = new Date(today)
      start.setDate(today.getDate() - dayOfWeek)
      if (type === 'start') return formatDate(start)
      return formatDate(today)
    }

    case 'last_week': {
      const dayOfWeek = today.getDay()
      const lastWeekEnd = new Date(today)
      lastWeekEnd.setDate(today.getDate() - dayOfWeek - 1)
      const lastWeekStart = new Date(lastWeekEnd)
      lastWeekStart.setDate(lastWeekEnd.getDate() - 6)
      if (type === 'start') return formatDate(lastWeekStart)
      return formatDate(lastWeekEnd)
    }

    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      if (type === 'start') return formatDate(start)
      return formatDate(today)
    }

    case 'last_month': {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      if (type === 'start') return formatDate(lastMonth)
      return formatDate(lastMonthEnd)
    }

    default:
      // Default to last 30 days
      if (type === 'end') return formatDate(today)
      const start = new Date(today)
      start.setDate(start.getDate() - 30)
      return formatDate(start)
  }
}

/**
 * POST /api/google-analytics-v1/query
 *
 * Handles Google Analytics v1 query requests
 *
 * Request body:
 * - query: Natural language query (e.g., "show sessions by country last 7 days")
 * - property: Property key from GA4_PROPERTIES
 *
 * Response:
 * - success: boolean
 * - query: Original user query
 * - property: Property information
 * - ga4_query: Generated GA4 query
 * - results: Processed result rows
 * - totals: Aggregated metrics (if applicable)
 * - execution_time_ms: Total execution time
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    logger.info(`[${requestId}] Google Analytics v1 query request started`)

    // Parse request body
    const body: GoogleAnalyticsV1Request = await request.json()
    logger.info(`[${requestId}] Request body received`, { body })

    const { query, property } = body

    // Validate query
    if (!query) {
      logger.error(`[${requestId}] No query provided in request`)
      return NextResponse.json({ error: 'No query provided' }, { status: 400 })
    }

    // Validate property
    if (!property) {
      logger.error(`[${requestId}] No property provided in request`)
      return NextResponse.json({ error: 'No property provided' }, { status: 400 })
    }

    // Get property information
    const propertyInfo = GA4_PROPERTIES[property]
    if (!propertyInfo) {
      logger.error(`[${requestId}] Invalid property key`, {
        property,
        availableProperties: Object.keys(GA4_PROPERTIES),
      })
      return NextResponse.json(
        {
          error: `Invalid property key: ${property}. Available properties: ${Object.keys(GA4_PROPERTIES).join(', ')}`,
        },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] Found property`, {
      propertyId: propertyInfo.id,
      propertyName: propertyInfo.name,
    })

    // Generate GA4 query using AI
    const queryResult = await generateGA4Query(query)

    logger.info(`[${requestId}] Generated GA4 parameters`, {
      dimensions: queryResult.dimensions,
      metrics: queryResult.metrics,
      dateRanges: queryResult.dateRanges,
      queryType: queryResult.query_type,
      tables: queryResult.tables_used,
      metrics_used: queryResult.metrics_used,
    })

    // Execute the GA4 query against Google Analytics API
    logger.info(`[${requestId}] Executing GA4 query against property ${propertyInfo.id}`)
    
    // Convert the AI response to API request format
    const apiRequest = {
      propertyId: propertyInfo.id,
      dimensions: queryResult.dimensions,
      metrics: queryResult.metrics,
      dateRanges: queryResult.dateRanges
    }
    const apiResult = await makeGA4Request(apiRequest, logger)

    // Process results
    const processedResults = processResults(apiResult, requestId, logger)

    const executionTime = Date.now() - startTime

    logger.info(`[${requestId}] Query executed successfully`, {
      rowCount: processedResults.row_count,
      totalRows: processedResults.total_rows,
      hasTotals: !!processedResults.totals,
    })

    logger.info(`[${requestId}] Returning response`, {
      rowsReturned: processedResults.row_count,
      executionTime,
    })

    // Build response
    const response = {
      success: true,
      query: query,
      property: {
        id: propertyInfo.id,
        name: propertyInfo.name,
        displayName: propertyInfo.displayName,
      },
      dimensions: queryResult.dimensions,
      metrics: queryResult.metrics,
      dateRanges: queryResult.dateRanges,
      query_type: queryResult.query_type,
      tables_used: queryResult.tables_used,
      metrics_used: queryResult.metrics_used,
      data: processedResults.rows,
      row_count: processedResults.row_count,
      total_rows: processedResults.total_rows,
      totals: processedResults.totals,
      execution_time_ms: executionTime,
    }

    return NextResponse.json(response)
  } catch (error) {
    const executionTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    logger.error(`[${requestId}] Google Analytics v1 query failed`, {
      error: errorMessage,
      executionTime,
    })

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: 'Failed to process Google Analytics v1 query',
        suggestion: 'Please check your query and try again.',
      },
      { status: 500 }
    )
  }
}
