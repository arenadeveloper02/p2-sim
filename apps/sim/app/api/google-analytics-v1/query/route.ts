import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { GA4_PROPERTIES } from './constants'
import { GA4ApiClient } from './ga4-api'
import { generateGA4Query } from './query-generation'
import { processResults } from './result-processing'
import type { GoogleAnalyticsV1Request, ProcessedResults } from './types'

const logger = createLogger('GoogleAnalyticsV1API')

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = Math.random().toString(36).substring(7)

  try {
    logger.info(`[${requestId}] Google Analytics v1 query request received`)

    const body: GoogleAnalyticsV1Request = await request.json()
    const { query, property } = body

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    if (!property) {
      return NextResponse.json({ error: 'Property is required' }, { status: 400 })
    }

    // Validate property
    const isValidProperty = GA4_PROPERTIES.some((p) => p.id === property)
    if (!isValidProperty) {
      return NextResponse.json(
        { error: 'Invalid property ID', availableProperties: GA4_PROPERTIES },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] Processing request`, {
      query,
      property,
      queryLength: query.length,
    })

    // Generate GA4 query using AI
    const ga4Query = await generateGA4Query(query, logger)

    // Create GA4 API client and run query
    const ga4Client = new GA4ApiClient(logger)

    // Build the GA4 API request
    const apiRequest = {
      dimensions: ga4Query.dimensions.map((name) => ({ name })),
      metrics: ga4Query.metrics.map((name) => ({ name })),
      dateRanges: ga4Query.dateRanges,
    }

    logger.info(`[${requestId}] Executing GA4 query`, {
      dimensions: ga4Query.dimensions,
      metrics: ga4Query.metrics,
      dateRanges: ga4Query.dateRanges,
    })

    const apiResult = await ga4Client.runReport(property, apiRequest)

    // Process results
    const processedResults: ProcessedResults = processResults(apiResult, requestId, logger)

    logger.info(`[${requestId}] Query completed successfully`, {
      rowCount: processedResults.row_count,
    })

    return NextResponse.json({
      success: true,
      data: processedResults,
      query: ga4Query.query,
      metadata: {
        requestId,
        property,
        dimensions: ga4Query.dimensions,
        metrics: ga4Query.metrics,
        dateRanges: ga4Query.dateRanges,
      },
    })
  } catch (error) {
    logger.error(`[${requestId}] Query failed`, { error })

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        requestId,
      },
      { status: 500 }
    )
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    logger.info('Google Analytics v1 API health check')

    return NextResponse.json({
      success: true,
      message: 'Google Analytics v1 API is running',
      availableProperties: GA4_PROPERTIES,
      version: '1.0.0',
    })
  } catch (error) {
    logger.error('Health check failed', { error })

    return NextResponse.json(
      {
        success: false,
        error: 'API health check failed',
      },
      { status: 500 }
    )
  }
}
