import { createLogger } from '@/lib/logs/console/logger'
import { NextRequest, NextResponse } from 'next/server'
import { generateGA4Query, buildContext } from './ai-query-generation'
import { extractDateRanges } from './date-extraction'
import { formatDate, getLastNDaysRange } from './date-utils'
import { createGA4Client } from './ga4-api'
import { detectIntent, isComparisonQuery } from './intent-detector'
import { processGA4Results } from './result-processing'
import { buildResponse, buildComparisonResponse } from './response-builder'

const logger = createLogger('GA4QueryAPI')

/**
 * POST /api/ga4/query
 * 
 * Generate and execute GA4 queries using natural language
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID()
  
  try {
    const body = await request.json()
    const { query, propertyId, credentials } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required and must be a string' },
        { status: 400 }
      )
    }

    if (!propertyId || typeof propertyId !== 'string') {
      return NextResponse.json(
        { error: 'Property ID is required and must be a string' },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] GA4 query request`, {
      query,
      propertyId,
      hasCredentials: !!credentials,
    })

    // Step 1: Extract date ranges from query
    let dateRanges = extractDateRanges(query)
    
    if (dateRanges.length === 0) {
      logger.info(`[${requestId}] No date range found, defaulting to last 30 days`)
      dateRanges = [getLastNDaysRange(30)]
    }

    logger.info(`[${requestId}] Extracted ${dateRanges.length} date range(s)`, { dateRanges })

    // Step 2: Detect intent
    const intent = detectIntent(query)
    const isComparison = isComparisonQuery(query) && dateRanges.length >= 2

    logger.info(`[${requestId}] Detected intent: ${intent}, isComparison: ${isComparison}`)

    // Step 3: Build context
    const context = buildContext(dateRanges)

    // Step 4: Generate GA4 query using AI
    const ga4Query = await generateGA4Query(query, intent, context)

    // Add property ID and date ranges to query
    ga4Query.dateRanges = dateRanges.map((range) => ({
      startDate: range.start,
      endDate: range.end,
    }))

    logger.info(`[${requestId}] GA4 query generated`, {
      dimensions: ga4Query.dimensions?.length || 0,
      metrics: ga4Query.metrics?.length || 0,
      dateRanges: ga4Query.dateRanges.length,
    })

    // Step 5: Execute query against GA4 API
    const ga4Client = createGA4Client(propertyId, credentials)

    if (isComparison && dateRanges.length >= 2) {
      // Execute comparison queries
      const mainQuery = { ...ga4Query, dateRanges: [ga4Query.dateRanges[0]] }
      const comparisonQueryObj = { ...ga4Query, dateRanges: [ga4Query.dateRanges[1]] }

      logger.info(`[${requestId}] Executing comparison queries`)

      const [mainResponse, comparisonResponse] = await Promise.all([
        ga4Client.runReport(mainQuery),
        ga4Client.runReport(comparisonQueryObj),
      ])

      // Process results
      const mainResults = processGA4Results(
        mainResponse,
        propertyId,
        `${dateRanges[0].start} to ${dateRanges[0].end}`
      )
      const comparisonResults = processGA4Results(
        comparisonResponse,
        propertyId,
        `${dateRanges[1].start} to ${dateRanges[1].end}`
      )

      // Build response
      const responseText = buildComparisonResponse(mainResults, comparisonResults, query)

      return NextResponse.json({
        success: true,
        response: responseText,
        data: {
          main: mainResults.data,
          comparison: comparisonResults.data,
        },
        summary: {
          main: mainResults.summary,
          comparison: comparisonResults.summary,
        },
        query: ga4Query,
      })
    } else {
      // Execute single query
      logger.info(`[${requestId}] Executing single query`)

      const response = await ga4Client.runReport(ga4Query)

      // Process results
      const results = processGA4Results(
        response,
        propertyId,
        `${dateRanges[0].start} to ${dateRanges[0].end}`
      )

      // Build response
      const responseText = buildResponse(results, query, ga4Query)

      return NextResponse.json({
        success: true,
        response: responseText,
        data: results.data,
        summary: results.summary,
        query: ga4Query,
      })
    }
  } catch (error: any) {
    logger.error(`[${requestId}] GA4 query failed`, {
      error: error.message,
      stack: error.stack,
    })

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to execute GA4 query',
      },
      { status: 500 }
    )
  }
}
