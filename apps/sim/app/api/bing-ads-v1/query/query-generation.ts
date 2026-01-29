/**
 * Bing Ads query generation using AI - Following Google Ads v1 pattern
 */

import { createLogger } from '@/lib/logs/console/logger'
import { executeProviderRequest } from '@/providers'
import { resolveAIProvider } from './ai-provider'
import { DEFAULT_DATE_RANGE_DAYS } from './constants'
import { BING_ADS_SYSTEM_PROMPT } from './prompt'
import type { BingAdsQueryResponse } from './types'

const logger = createLogger('BingAdsV1QueryGen')

/**
 * Adds default date filter to Bing Ads query if missing
 *
 * @param query - Bing Ads query string
 * @returns Query with date filter added
 */
function addDefaultDateFilter(query: string): {
  query: string
  startDate: string
  endDate: string
} {
  // Calculate last 30 days ending yesterday
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const thirtyDaysAgo = new Date(yesterday)
  thirtyDaysAgo.setDate(yesterday.getDate() - (DEFAULT_DATE_RANGE_DAYS - 1))

  const endDate = yesterday.toISOString().split('T')[0]
  const startDate = thirtyDaysAgo.toISOString().split('T')[0]
  const defaultDateFilter = `TimeRange = {'${startDate}', '${endDate}'}`

  let updatedQuery = query

  // Add default date filter to query
  if (query.includes('WHERE')) {
    // Insert after WHERE
    updatedQuery = query.replace(/WHERE\s+/i, `WHERE ${defaultDateFilter} AND `)
  } else if (query.includes('FROM')) {
    // Add WHERE clause if missing
    const orderByIndex = query.toUpperCase().indexOf('ORDER BY')
    const insertPosition = orderByIndex > -1 ? orderByIndex : query.length

    const beforeOrderBy = query.substring(0, insertPosition).trim()
    const afterOrderBy = orderByIndex > -1 ? query.substring(orderByIndex) : ''

    updatedQuery = `${beforeOrderBy} WHERE ${defaultDateFilter} ${afterOrderBy}`
  }

  return { query: updatedQuery, startDate, endDate }
}

/**
 * Parses AI response and extracts Bing Ads parameters
 *
 * @param aiResponse - Response from AI provider
 * @returns Parsed Bing Ads response
 * @throws Error if response is invalid
 */
function parseAIResponse(aiResponse: any): BingAdsQueryResponse {
  // Extract content from AI response
  const responseContent =
    typeof aiResponse === 'string'
      ? aiResponse
      : 'content' in aiResponse
        ? aiResponse.content
        : JSON.stringify(aiResponse)

  // Try to extract JSON from response
  const jsonMatch = responseContent.match(/\{[\s\S]*\}/)
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseContent)

  // Check for valid Bing Ads parameters
  if (!parsed.reportType || !parsed.columns) {
    throw new Error('AI did not return valid Bing Ads parameters')
  }

  return parsed
}

/**
 * Validates and fixes Bing Ads parameters date filtering
 *
 * @param response - Parsed Bing Ads response
 * @returns Response with validated/fixed date filtering
 */
function validateDateFiltering(response: BingAdsQueryResponse): BingAdsQueryResponse {
  const hasDatePreset = response.datePreset
  const hasTimeRange = response.timeRange && response.timeRange.start && response.timeRange.end

  logger.info('Validating date filtering', {
    hasDatePreset,
    hasTimeRange,
    datePreset: response.datePreset,
    timeRange: response.timeRange
  })

  if (!hasDatePreset && !hasTimeRange) {
    logger.warn('Parameters missing date filter, adding default LastThirtyDays', {
      originalResponse: response,
    })

    return {
      ...response,
      datePreset: 'LastThirtyDays',
      aggregation: response.aggregation || 'Summary',
    }
  }

  // Ensure aggregation is set
  if (!response.aggregation) {
    return {
      ...response,
      aggregation: 'Summary',
    }
  }

  return response
}

/**
 * Generates Bing Ads query using AI
 *
 * This function:
 * - Resolves the appropriate AI provider (Grok or GPT-4o)
 * - Sends the user prompt to the AI with the Bing Ads system prompt
 * - AI calculates dates from CURRENT_DATE (same as Google Ads v1)
 * - Parses and validates the response
 * - Ensures proper date filtering is present
 *
 * @param userPrompt - Natural language query from user
 * @returns Bing Ads query response with metadata
 * @throws Error if generation fails
 */
export async function generateBingAdsQuery(userPrompt: string): Promise<BingAdsQueryResponse> {
  try {
    const { provider, model, apiKey } = resolveAIProvider()

    logger.info('Generating Bing Ads query', {
      provider,
      model,
      userPrompt,
    })

    const aiResponse = await executeProviderRequest(provider, {
      model,
      systemPrompt: BING_ADS_SYSTEM_PROMPT,
      context: `Generate Bing Ads query for: "${userPrompt}"`,
      messages: [
        {
          role: 'user',
          content: `Generate a Bing Ads query for: "${userPrompt}"`,
        },
      ],
      apiKey,
      temperature: 0.0,
      maxTokens: 2048,
    })

    logger.info('AI response received')

    // Parse AI response
    const parsed = parseAIResponse(aiResponse)

    // Validate and fix date filtering if needed
    const validated = validateDateFiltering(parsed)

    logger.info('Successfully generated Bing Ads parameters', {
      reportType: validated.reportType,
      columns: validated.columns,
      timeRange: validated.timeRange,
      queryType: validated.query_type,
      tables: validated.tables_used,
    })

    return validated
  } catch (error) {
    logger.error('Bing Ads query generation failed', { error, userPrompt })
    throw error
  }
}
