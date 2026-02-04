/**
 * Google Search Console Query API Route
 * Handles GSC search analytics queries with dynamic date calculation
 */

import { type NextRequest, NextResponse } from 'next/server'
import { GSC_ACCOUNTS } from '../constants'
import { makeGSCRequest } from '../gsc-api'
import { processResults } from './result-processing'
import type { GSCRequest } from '../types'

export async function POST(request: NextRequest): Promise<NextResponse<any>> {
  const startTime = Date.now()

  try {
    const body: GSCRequest = await request.json()
    const { query, site } = body

    // Validate query
    if (!query) {
      return NextResponse.json({ error: 'No query provided' }, { status: 400 })
    }

    // Validate site
    if (!site) {
      return NextResponse.json({ error: 'No site provided' }, { status: 400 })
    }

    // Get site information
    const siteInfo = GSC_ACCOUNTS[site as keyof typeof GSC_ACCOUNTS]
    if (!siteInfo) {
      return NextResponse.json(
        {
          error: `Invalid site key: ${site}. Available sites: ${Object.keys(GSC_ACCOUNTS).join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Generate GSC query using AI (mock for now)
    const queryResult = await generateGSCQuery(query)

    // Execute the GSC query against GSC API
    const apiResult = await makeGSCRequest(siteInfo.property, queryResult)

    // Process results
    const processedResults = processResults(apiResult, '')

    const executionTime = Date.now() - startTime

    // Build response
    const response = {
      success: true,
      query: query,
      site: {
        url: siteInfo.url,
        name: siteInfo.name,
        property: siteInfo.property
      },
      query_type: 'search_analytics',
      dimensions: queryResult.dimensions,
      type: queryResult.type,
      date_range: {
        start: queryResult.startDate,
        end: queryResult.endDate
      },
      data: processedResults.data,
      row_count: processedResults.row_count,
      totals: processedResults.totals,
      execution_time_ms: executionTime,
    }

    return NextResponse.json(response)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: 'Failed to execute GSC query'
      },
      { status: 500 }
    )
  }
}

/**
 * Mock function for generating GSC queries
 * In production, this would use AI to parse natural language
 */
async function generateGSCQuery(query: string): Promise<any> {
  // For now, return a basic query structure
  // In production, implement AI-powered query generation like other platforms
  
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const startDate = new Date(yesterday)
  startDate.setDate(startDate.getDate() - 29) // Last 30 days
  
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: yesterday.toISOString().split('T')[0],
    dimensions: ['query'],
    type: 'web',
    aggregationType: 'auto',
    rowLimit: 5000
  }
}
