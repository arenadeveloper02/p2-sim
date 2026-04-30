/**
 * GAQL query generation using AI
 */

import { createLogger } from '@sim/logger'
import { executeProviderRequest } from '@/providers'
import { resolveAIProvider } from './ai-provider'
import { DEFAULT_DATE_RANGE_DAYS } from './constants'
import { GAQL_SYSTEM_PROMPT } from './prompt'
import type { GAQLResponse } from './types'

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
 * Parses AI response and extracts GAQL query
 *
 * @param aiResponse - Response from AI provider
 * @returns Parsed GAQL response
 * @throws Error if response is invalid
 */
function parseAIResponse(aiResponse: any): GAQLResponse {
  // Extract content from AI response
  const responseContent =
    typeof aiResponse === 'string'
      ? aiResponse
      : 'content' in aiResponse
        ? aiResponse.content
        : JSON.stringify(aiResponse)

  // Try to extract JSON from response
  const jsonMatch = responseContent.match(/\{[\s\S]*\}/)
  const parsed: GAQLResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseContent)

  if (!parsed.gaql_query) {
    throw new Error('AI did not return a GAQL query')
  }

  return parsed
}

/**
 * Sanitizes GAQL queries that use the change_event resource.
 *
 * The Google Ads API rejects change_event queries that reference segments.date
 * or campaign.status with a PROHIBITED_SEGMENT_IN_SELECT_OR_WHERE_CLAUSE error.
 * This function strips those incompatible clauses and ensures the query has
 * the required change_event.change_date_time filter and LIMIT clause.
 *
 * @param response - Parsed GAQL response
 * @returns Response with sanitized change_event query
 */
function sanitizeChangeEventQuery(response: GAQLResponse): GAQLResponse {
  let query = response.gaql_query

  const isChangeEvent = /FROM\s+change_event/i.test(query)
  if (!isChangeEvent) {
    return response
  }

  const originalQuery = query

  query = query.replace(/,\s*segments\.date\b/gi, '')
  query = query.replace(/\bsegments\.date\s*,\s*/gi, '')

  query = query.replace(/\s+AND\s+segments\.date\s+BETWEEN\s+'[^']+'\s+AND\s+'[^']+'/gi, '')
  query = query.replace(/\bsegments\.date\s+BETWEEN\s+'[^']+'\s+AND\s+'[^']+'\s+AND\s+/gi, '')
  query = query.replace(
    /\bWHERE\s+segments\.date\s+BETWEEN\s+'[^']+'\s+AND\s+'[^']+'(?=\s*(ORDER|LIMIT|$))/gi,
    'WHERE '
  )

  query = query.replace(/\s+AND\s+campaign\.status\s*=\s*'[^']+'/gi, '')
  query = query.replace(/\bcampaign\.status\s*=\s*'[^']+'\s+AND\s+/gi, '')
  query = query.replace(
    /\bWHERE\s+campaign\.status\s*=\s*'[^']+'(?=\s*(ORDER|LIMIT|$))/gi,
    'WHERE '
  )

  query = query.replace(/\bWHERE\s+(?=ORDER|LIMIT|$)/gi, '').trim()

  const hasChangeDateTime = /change_event\.change_date_time/i.test(query)
  if (!hasChangeDateTime) {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)

    const startDate = yesterday.toISOString().split('T')[0]
    const endDate = tomorrow.toISOString().split('T')[0]
    const dateFilter = `change_event.change_date_time >= '${startDate}' AND change_event.change_date_time <= '${endDate}'`

    if (/\bWHERE\b/i.test(query)) {
      query = query.replace(/\bWHERE\b/i, `WHERE ${dateFilter} AND`)
    } else {
      const orderByIdx = query.search(/\bORDER\s+BY\b/i)
      const limitIdx = query.search(/\bLIMIT\b/i)
      const insertIdx = Math.min(
        orderByIdx === -1 ? Number.POSITIVE_INFINITY : orderByIdx,
        limitIdx === -1 ? Number.POSITIVE_INFINITY : limitIdx
      )
      if (insertIdx === Number.POSITIVE_INFINITY) {
        query = `${query} WHERE ${dateFilter}`
      } else {
        query = `${query.slice(0, insertIdx).trim()} WHERE ${dateFilter} ${query.slice(insertIdx)}`
      }
    }
  }

  if (!/\bLIMIT\s+\d+/i.test(query)) {
    query = `${query.trim()} LIMIT 500`
  }

  query = query.replace(/\s+/g, ' ').trim()

  if (query !== originalQuery) {
    logger.info('Sanitized change_event query (removed incompatible clauses)', {
      originalQuery,
      sanitizedQuery: query,
    })
  }

  return { ...response, gaql_query: query }
}

/**
 * Validates and fixes GAQL query date filtering
 *
 * @param response - Parsed GAQL response
 * @returns Response with validated/fixed date filtering
 */
function validateDateFiltering(response: GAQLResponse): GAQLResponse {
  if (/FROM\s+change_event/i.test(response.gaql_query)) {
    return response
  }
  const hasDateFilter =
    response.gaql_query.includes('segments.date') && response.gaql_query.includes('BETWEEN')

  if (!hasDateFilter) {
    logger.warn('Query missing BETWEEN date filter, adding default last 30 days ending yesterday', {
      originalQuery: response.gaql_query,
    })

    const { query, startDate, endDate } = addDefaultDateFilter(response.gaql_query)

    logger.info('Updated query with default BETWEEN date filter (last 30 days ending yesterday)', {
      updatedQuery: query,
      startDate,
      endDate,
    })

    return {
      ...response,
      gaql_query: query,
    }
  }

  return response
}

/**
 * Generates GAQL query using AI
 *
 * This function:
 * - Resolves the appropriate AI provider (Grok or GPT-4o)
 * - Sends the user prompt to the AI with the GAQL system prompt
 * - Parses and validates the response
 * - Ensures proper date filtering is present
 *
 * @param userPrompt - Natural language query from user
 * @returns GAQL query response with metadata
 * @throws Error if generation fails
 */
export async function generateGAQLQuery(userPrompt: string): Promise<GAQLResponse> {
  try {
    const { provider, model, apiKey } = resolveAIProvider(logger)

    logger.info('Generating GAQL query', {
      provider,
      model,
      userPrompt,
    })

    const aiResponse = await executeProviderRequest(provider, {
      model,
      systemPrompt: GAQL_SYSTEM_PROMPT,
      context: `Generate GAQL query for: "${userPrompt}"`,
      messages: [
        {
          role: 'user',
          content: `Generate a GAQL query for: "${userPrompt}"`,
        },
      ],
      apiKey,
      temperature: 0.0,
      maxTokens: 2048,
    })

    logger.info('AI response received')

    // Parse AI response
    const parsed = parseAIResponse(aiResponse)

    // Sanitize change_event queries (strip incompatible segments.date / campaign.status clauses)
    const sanitized = sanitizeChangeEventQuery(parsed)

    // Validate and fix date filtering if needed (skipped for change_event)
    const validated = validateDateFiltering(sanitized)

    logger.info('Successfully generated GAQL query', {
      gaql: validated.gaql_query,
      queryType: validated.query_type,
      tables: validated.tables_used,
    })

    return validated
  } catch (error) {
    logger.error('GAQL generation failed', { error, userPrompt })
    throw error
  }
}
