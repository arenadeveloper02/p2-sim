/**
 * Bing Ads V1 Query Generation
 * Uses AI to generate Bing Ads queries with dynamic date calculation
 */

import { createLogger } from '@/lib/logs/console/logger'
import { resolveAIProvider } from './ai-provider'
import { BING_ADS_SYSTEM_PROMPT } from './prompt-new'
import type { BingAdsQueryResponse } from './types'

const logger = createLogger('BingAdsV1QueryGeneration')

/**
 * Generates a Bing Ads query using AI
 *
 * @param query - Natural language query from user
 * @returns Parsed Bing Ads query parameters
 */
export async function generateBingAdsQuery(query: string): Promise<BingAdsQueryResponse> {
  const startTime = Date.now()
  const requestId = Math.random().toString(36).substring(7)

  try {
    logger.info(`[${requestId}] Generating Bing Ads query`, { query })

    // Resolve AI provider
    const provider = resolveAIProvider()
    logger.info(`[${requestId}] Using AI provider`, { provider: provider.provider, model: provider.model })

    // Create the prompt
    const prompt = BING_ADS_SYSTEM_PROMPT

    // Call AI API
    const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          {
            role: 'system',
            content: prompt,
          },
          {
            role: 'user',
            content: query,
          },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      throw new Error(`AI API request failed: ${response.status} ${response.statusText}`)
    }

    const aiResponse = await response.json()
    const content = aiResponse.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('No content received from AI API')
    }

    logger.info(`[${requestId}] AI response received`, { contentLength: content.length })

    // Parse AI response
    const parsedQuery = parseAIResponse(content)

    // Validate the parsed query
    validateParsedQuery(parsedQuery)

    const executionTime = Date.now() - startTime
    logger.info(`[${requestId}] Query generated successfully`, {
      reportType: parsedQuery.reportType,
      timeRange: parsedQuery.timeRange,
      executionTime,
    })

    return parsedQuery
  } catch (error) {
    const executionTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    logger.error(`[${requestId}] Query generation failed`, {
      error: errorMessage,
      executionTime,
    })

    throw new Error(`Failed to generate Bing Ads query: ${errorMessage}`)
  }
}

/**
 * Parses AI response and extracts Bing Ads parameters
 *
 * @param content - Raw AI response content
 * @returns Parsed Bing Ads query parameters
 */
function parseAIResponse(content: string): BingAdsQueryResponse {
  try {
    // Try to parse as JSON
    const parsed = JSON.parse(content)

    // Ensure required fields
    if (!parsed.reportType) {
      throw new Error('Missing reportType in AI response')
    }

    if (!parsed.columns || !Array.isArray(parsed.columns)) {
      throw new Error('Missing or invalid columns in AI response')
    }

    if (!parsed.timeRange || !parsed.timeRange.start || !parsed.timeRange.end) {
      throw new Error('Missing or invalid timeRange in AI response')
    }

    // Validate date format
    const startDate = new Date(parsed.timeRange.start)
    const endDate = new Date(parsed.timeRange.end)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error('Invalid date format in timeRange')
    }

    if (startDate > endDate) {
      throw new Error('Start date cannot be after end date')
    }

    return {
      reportType: parsed.reportType,
      columns: parsed.columns,
      timeRange: {
        start: parsed.timeRange.start,
        end: parsed.timeRange.end,
      },
      aggregation: parsed.aggregation || 'Summary',
      query_type: 'campaigns', // Default query type
      tables_used: ['campaign'], // Default table
      metrics_used: ['impressions', 'clicks', 'spend'], // Default metrics
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON format in AI response')
    }
    throw error
  }
}

/**
 * Validates the parsed query parameters
 *
 * @param parsedQuery - Parsed query parameters
 */
function validateParsedQuery(parsedQuery: BingAdsQueryResponse): void {
  // Validate report type
  const validReportTypes = [
    'CampaignPerformance',
    'AdGroupPerformance',
    'KeywordPerformance',
    'AccountPerformance',
    'SearchQueryPerformance',
  ]

  if (!validReportTypes.includes(parsedQuery.reportType)) {
    throw new Error(`Invalid reportType: ${parsedQuery.reportType}`)
  }

  // Validate required columns
  const requiredColumns = ['AccountName', 'AccountId']
  for (const column of requiredColumns) {
    if (!parsedQuery.columns.includes(column)) {
      throw new Error(`Missing required column: ${column}`)
    }
  }

  // Validate aggregation
  const validAggregations = ['Summary', 'Daily', 'Weekly', 'Monthly']
  if (!validAggregations.includes(parsedQuery.aggregation || 'Summary')) {
    throw new Error(`Invalid aggregation: ${parsedQuery.aggregation}`)
  }
}
