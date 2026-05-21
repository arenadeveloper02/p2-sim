/**
 * GAQL query generation using AI
 */

import { createLogger } from '@sim/logger'
import { executeProviderRequest } from '@/providers'
import { resolveAIProvider } from './ai-provider'
import { DEFAULT_DATE_RANGE_DAYS } from './constants'
import { getGaqlSystemPrompt } from './prompt'
import type { GoogleAdsRouterResponse, GAQLResponse, RSAResponse } from './types'

const logger = createLogger('GoogleAdsV1QueryGen')

/**
 * Extracts date range from GAQL query
 *
 * @param query - GAQL query string
 * @returns Date range with start and end dates, or null if not found
 */
export function extractDateRange(query: string): {
  startDate: string
  endDate: string
} | null {
  // Match segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
  const datePattern =
    /segments\.date\s+BETWEEN\s+'(\d{4}-\d{2}-\d{2})'\s+AND\s+'(\d{4}-\d{2}-\d{2})'/i
  const match = query.match(datePattern)

  if (match?.[1] && match[2]) {
    return {
      startDate: match[1],
      endDate: match[2],
    }
  }

  return null
}

/**
 * Adds default date filter to GAQL query if missing
 *
 * @param query - GAQL query string
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
  const defaultDateFilter = `segments.date BETWEEN '${startDate}' AND '${endDate}'`

  let updatedQuery = query

  // Add default date filter to WHERE clause
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
 * Parses AI response and extracts router response (GAQL or RSA)
 *
 * @param aiResponse - Response from AI provider
 * @returns Parsed router response (GAQL or RSA)
 * @throws Error if response is invalid
 */
function parseAIResponse(aiResponse: any): GoogleAdsRouterResponse {
  // Extract content from AI response
  const responseContent =
    typeof aiResponse === 'string'
      ? aiResponse
      : 'content' in aiResponse
        ? aiResponse.content
        : JSON.stringify(aiResponse)

  // Try to extract JSON from response
  const jsonMatch = responseContent.match(/\{[\s\S]*\}/)
  const parsed: GoogleAdsRouterResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseContent)

  // Validate skill field
  if (!parsed.skill || (parsed.skill !== 'gaql' && parsed.skill !== 'rsa')) {
    throw new Error('AI did not return a valid skill field (must be "gaql" or "rsa")')
  }

  // Validate GAQL-specific fields
  if (parsed.skill === 'gaql' && !parsed.gaql_query) {
    throw new Error('AI did not return a GAQL query for skill=gaql')
  }

  // Validate RSA-specific fields
  if (parsed.skill === 'rsa' && (!parsed.headlines || !parsed.descriptions)) {
    throw new Error('AI did not return headlines or descriptions for skill=rsa')
  }

  return parsed
}

/**
 * Validates and fixes GAQL query date filtering (only applies to GAQL skill)
 *
 * @param response - Parsed router response
 * @returns Response with validated/fixed date filtering (if GAQL skill)
 */
function validateDateFiltering(response: GoogleAdsRouterResponse): GoogleAdsRouterResponse {
  // Only apply date filtering validation for GAQL skill
  if (response.skill !== 'gaql') {
    return response
  }

  const gaqlResponse = response as GAQLResponse
  const hasDateFilter =
    gaqlResponse.gaql_query.includes('segments.date') && gaqlResponse.gaql_query.includes('BETWEEN')

  if (!hasDateFilter) {
    logger.warn('Query missing BETWEEN date filter, adding default last 30 days ending yesterday', {
      originalQuery: gaqlResponse.gaql_query,
    })

    const { query, startDate, endDate } = addDefaultDateFilter(gaqlResponse.gaql_query)

    logger.info('Updated query with default BETWEEN date filter (last 30 days ending yesterday)', {
      updatedQuery: query,
      startDate,
      endDate,
    })

    return {
      ...gaqlResponse,
      gaql_query: query,
    }
  }

  return response
}

/**
 * Generates Google Ads response using AI (routes to GAQL or RSA based on query)
 *
 * This function:
 * - Resolves the appropriate AI provider (Grok or GPT-4o)
 * - Sends the user prompt to the AI with the router system prompt
 * - Parses and validates the response (GAQL or RSA based on skill)
 * - For GAQL: ensures proper date filtering is present
 *
 * @param userPrompt - Natural language query from user
 * @returns Router response (GAQL or RSA) with metadata
 * @throws Error if generation fails
 */
export async function generateGAQLQuery(userPrompt: string): Promise<GoogleAdsRouterResponse> {
  try {
    const { provider, model, apiKey } = resolveAIProvider(logger)

    logger.info('Generating Google Ads response (routing to GAQL or RSA)', {
      provider,
      model,
      userPrompt,
    })

    const systemPrompt = await getGaqlSystemPrompt()

    const aiResponse = await executeProviderRequest(provider, {
      model,
      systemPrompt,
      context: `Generate Google Ads response for: "${userPrompt}"`,
      messages: [
        {
          role: 'user',
          content: `Generate a Google Ads response for: "${userPrompt}"`,
        },
      ],
      apiKey,
      temperature: 1,
      maxTokens: 2048,
    })

    logger.info('AI response received')

    // Parse AI response
    const parsed = parseAIResponse(aiResponse)

    // Validate and fix date filtering if needed (only for GAQL)
    const validated = validateDateFiltering(parsed)

    if (validated.skill === 'gaql') {
      const gaqlResponse = validated as GAQLResponse
      logger.info('Successfully generated GAQL query', {
        gaql: gaqlResponse.gaql_query,
        queryType: gaqlResponse.query_type,
        tables: gaqlResponse.tables_used,
      })
    } else {
      const rsaResponse = validated as RSAResponse
      logger.info('Successfully generated RSA ad copy', {
        headlineCount: rsaResponse.headlines.length,
        descriptionCount: rsaResponse.descriptions.length,
      })
    }

    return validated
  } catch (error) {
    logger.error('Google Ads response generation failed', { error, userPrompt })
    throw error
  }
}
