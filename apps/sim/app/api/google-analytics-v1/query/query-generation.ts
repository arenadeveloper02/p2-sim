/**
 * Google Analytics query generation using AI - Following Google Ads v1 pattern
 */

import { createLogger } from '@sim/logger'
import { executeProviderRequest } from '@/providers'
import { resolveAIProvider } from './ai-provider'
import { DEFAULT_DATE_RANGE_DAYS } from './constants'
import { GA4_SYSTEM_PROMPT } from './prompt'
import type { GA4QueryResponse } from './types'

const logger = createLogger('GoogleAnalyticsV1QueryGen')

/**
 * Adds default date filter to GA4 query if missing
 *
 * @param query - GA4 query string
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

  return { query, startDate, endDate }
}

/**
 * Parses AI response and extracts GA4 parameters
 *
 * @param aiResponse - Response from AI provider
 * @returns Parsed GA4 response
 * @throws Error if response is invalid
 */
function parseAIResponse(aiResponse: any): GA4QueryResponse {
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

  // Check for valid GA4 parameters
  if (!parsed.dimensions || !parsed.metrics || !parsed.dateRanges) {
    throw new Error('AI did not return valid GA4 parameters')
  }

  return parsed
}

/**
 * Validates and fixes GA4 parameters date filtering
 *
 * @param response - Parsed GA4 response
 * @returns Response with validated/fixed date filtering
 */
function validateDateFiltering(response: GA4QueryResponse): GA4QueryResponse {
  const hasDateRanges = response.dateRanges && response.dateRanges.length > 0

  logger.info('Validating date filtering', {
    hasDateRanges,
    dateRanges: response.dateRanges
  })

  if (!hasDateRanges) {
    logger.warn('Parameters missing date ranges, adding default LastThirtyDays', {
      originalResponse: response,
    })

    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const thirtyDaysAgo = new Date(yesterday)
    thirtyDaysAgo.setDate(yesterday.getDate() - 29)

    return {
      ...response,
      dateRanges: [{
        startDate: thirtyDaysAgo.toISOString().split('T')[0],
        endDate: yesterday.toISOString().split('T')[0]
      }]
    }
  }

  return response
}

/**
 * Generates Google Analytics query using AI
 *
 * This function:
 * - Resolves the appropriate AI provider (Grok or GPT-4o)
 * - Sends the user prompt to the AI with the GA4 system prompt
 * - AI calculates dates from CURRENT_DATE (same as Google Ads v1)
 * - Parses and validates the response
 * - Ensures proper date filtering is present
 *
 * @param userPrompt - Natural language query from user
 * @returns GA4 query response with metadata
 * @throws Error if generation fails
 */
export async function generateGA4Query(userPrompt: string): Promise<GA4QueryResponse> {
  try {
    const { provider, model, apiKey } = resolveAIProvider(logger)

    logger.info('Generating Google Analytics query', {
      provider,
      model,
      userPrompt,
    })

    const aiResponse = await executeProviderRequest(provider, {
      model,
      systemPrompt: GA4_SYSTEM_PROMPT,
      context: `Generate Google Analytics query for: "${userPrompt}"`,
      messages: [
        {
          role: 'user',
          content: `Generate a Google Analytics query for: "${userPrompt}"`,
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

    logger.info('Successfully generated GA4 parameters', {
      dimensions: validated.dimensions,
      metrics: validated.metrics,
      dateRanges: validated.dateRanges,
      queryType: validated.query_type,
      tables: validated.tables_used,
    })

    return validated
  } catch (error) {
    logger.error('Google Analytics query generation failed', { error, userPrompt })
    throw error
  }
}
