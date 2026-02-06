/**
 * Google Ads V1 API Route
 * Simplified, AI-powered Google Ads query endpoint
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'
import { executeProviderRequest } from '@/providers'
import { GOOGLE_ADS_ACCOUNTS } from '../../google-ads/query/constants'
import { makeGoogleAdsRequest } from '../../google-ads/query/google-ads-api'
import { extractDateRange, generateGAQLQuery } from './query-generation'
import { processResults } from './result-processing'
import { resolveAIProvider } from './ai-provider'
import type { GoogleAdsV1Request } from './types'

const logger = createLogger('GoogleAdsV1API')

/**
 * Detects if a query is asking for comparison (year-over-year, month-over-month, etc.)
 */
function detectComparisonQuery(query: string): boolean {
  const comparisonKeywords = [
    'compare', 'vs', 'versus', 'and', 'against', 'compared to',
    'year over year', 'yoy', 'month over month', 'mom',
    'previous year', 'last year', 'prior year'
  ]
  
  return comparisonKeywords.some(keyword => 
    query.toLowerCase().includes(keyword.toLowerCase())
  )
}

/**
 * Handles comparison queries by splitting into multiple simple queries
 */
async function handleComparisonQuery(
  query: string, 
  accounts: string, 
  accountInfo: any, 
  requestId: string
): Promise<NextResponse> {
  try {
    logger.info(`[${requestId}] Processing comparison query: ${query}`)
    
    // Extract date ranges using hybrid AI approach
    const dateRanges = await extractDateRangesHybrid(query)
    
    if (!dateRanges || dateRanges.length < 2) {
      return NextResponse.json({
        error: 'Could not extract two date ranges for comparison. Please specify clear date ranges.',
        example: 'Compare October 2025 vs October 2024'
      }, { status: 400 })
    }
    
    const results = []
    
    // Execute queries for each date range
    for (const dateRange of dateRanges) {
      const simpleQuery = generateSimpleQueryForDateRange(dateRange)
      
      try {
        const queryResult = await generateGAQLQuery(simpleQuery)
        const apiResult = await makeGoogleAdsRequest(accountInfo.id, queryResult.gaql_query)
        const processedResults = processResults(apiResult, requestId, logger)
        
        results.push({
          dateRange: dateRange,
          query: simpleQuery,
          gaqlQuery: queryResult.gaql_query,
          data: processedResults.rows,
          totals: processedResults.totals,
          rowCount: processedResults.row_count
        })
      } catch (error) {
        logger.error(`[${requestId}] Error executing query for ${dateRange}:`, error)
        results.push({
          dateRange: dateRange,
          error: error instanceof Error ? error.message : 'Unknown error',
          data: [],
          totals: {},
          rowCount: 0
        })
      }
    }
    
    return NextResponse.json({
      success: true,
      query: query,
      account: {
        id: accountInfo.id,
        name: accountInfo.name
      },
      comparison: {
        type: 'year_over_year',
        periods: results
      },
      execution_time_ms: Date.now() - Date.now()
    })
    
  } catch (error) {
    logger.error(`[${requestId}] Comparison query failed:`, error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Comparison query failed'
    }, { status: 500 })
  }
}

/**
 * AI-powered date extraction with hallucination protection
 */
async function extractDateRangesWithAI(query: string): Promise<string[] | null> {
  const prompt = `
Extract date ranges from this comparison query: "${query}"

Return ONLY a JSON array with the date ranges in format ["Month YYYY", "Month YYYY"].
If no clear date ranges found, return [].

IMPORTANT RULES:
- Only return REAL dates mentioned in the query
- Do NOT hallucinate or make up dates
- Only extract dates that are explicitly stated
- Month must be full name (January, February, etc.)
- Year must be 4 digits (2024, 2025, etc.)

Examples:
- "Compare October 2025 vs October 2024" → ["October 2025", "October 2024"]
- "November 2025 and November 2024 yoy" → ["November 2025", "November 2024"]
- "Show December 2025 compared to December 2024" → ["December 2025", "December 2024"]
- "Compare last month vs same month last year" → [] (no explicit dates)
`

  try {
    // Use the same AI provider as GAQL generation
    const { provider, model, apiKey } = resolveAIProvider(logger)
    
    const aiResponse = await executeProviderRequest(provider, {
      model,
      systemPrompt: 'You are a date extraction expert. Extract only explicit dates mentioned in queries.',
      context: `Extract dates from: "${query}"`,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
    })
    
    // Extract content from AI response
    const responseContent = typeof aiResponse === 'string' 
      ? aiResponse 
      : 'content' in aiResponse 
        ? aiResponse.content 
        : JSON.stringify(aiResponse)
    
    let dates
    try {
      dates = JSON.parse(responseContent)
    } catch (parseError) {
      logger.error('AI returned invalid JSON:', responseContent)
      return null
    }
    
    // Validate AI response to prevent hallucinations
    if (!Array.isArray(dates) || dates.length < 2) {
      return null
    }
    
    // Validate each date format
    const validDates = dates.filter(date => {
      if (typeof date !== 'string') return false
      
      // Check if it matches "Month YYYY" format
      const monthYearPattern = /^([A-Z][a-z]+) (\d{4})$/
      const match = date.match(monthYearPattern)
      
      if (!match) return false
      
      const month = match[1]
      const year = match[2]
      
      // Validate month
      const validMonths = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December']
      
      if (!validMonths.includes(month)) return false
      
      // Validate year (reasonable range)
      const yearNum = parseInt(year)
      if (yearNum < 2020 || yearNum > 2030) return false
      
      // Verify the date actually exists in the original query
      if (!query.toLowerCase().includes(month.toLowerCase()) || !query.includes(year)) {
        logger.warn(`AI hallucinated date: ${date} not found in original query: ${query}`)
        return false
      }
      
      return true
    })
    
    return validDates.length >= 2 ? validDates.slice(0, 2) : null
    
  } catch (error) {
    logger.error('AI date extraction failed:', error)
    return null
  }
}

/**
 * Hybrid date extraction - AI first, fallback to logic
 */
async function extractDateRangesHybrid(query: string): Promise<string[] | null> {
  // Try AI first (most dynamic)
  const aiDates = await extractDateRangesWithAI(query)
  if (aiDates) {
    logger.info(`AI successfully extracted dates: ${aiDates.join(', ')}`)
    return aiDates
  }
  
  // Fallback to current logic (reliable backup)
  logger.info('AI extraction failed, using fallback logic')
  return extractComparisonDateRanges(query)
}

/**
 * Extracts date ranges from comparison queries - Dynamic approach without regex
 */
function extractComparisonDateRanges(query: string): string[] | null {
  // Clean the query by removing comparison type keywords
  const comparisonKeywords = ['yoy', 'mom', 'year-over-year', 'month-over-month', 'week-over-week', 'wow']
  let cleanedQuery = query.toLowerCase()
  
  comparisonKeywords.forEach(keyword => {
    cleanedQuery = cleanedQuery.replace(new RegExp(keyword, 'gi'), '')
  })
  
  // Dynamic approach: Split by comparison words and extract date patterns
  const comparisonWords = ['vs', 'versus', 'and', 'compare', 'compared to', 'against']
  let dateRanges: string[] = []
  
  // Try different splitting strategies
  for (const word of comparisonWords) {
    const parts = cleanedQuery.split(word)
    if (parts.length >= 2) {
      dateRanges = parts
        .map(part => extractDateFromText(part.trim()))
        .filter(date => date !== null)
        .slice(0, 2)
      
      if (dateRanges.length >= 2) {
        return dateRanges
      }
    }
  }
  
  // Fallback: Look for month-year patterns in the entire cleaned query
  return extractMonthYearFromText(cleanedQuery)
}

/**
 * Extracts date from text using dynamic parsing
 */
function extractDateFromText(text: string): string | null {
  const words = text.split(' ')
  
  // Look for month + year pattern
  for (let i = 0; i < words.length - 1; i++) {
    const currentWord = words[i].toLowerCase()
    const nextWord = words[i + 1]
    
    // Check if current word is a month
    if (isMonth(currentWord) && isYear(nextWord)) {
      return `${capitalizeMonth(currentWord)} ${nextWord}` 
    }
  }
  
  return null
}

/**
 * Extracts multiple month-year patterns from text
 */
function extractMonthYearFromText(text: string): string[] | null {
  const words = text.split(' ')
  const dates: string[] = []
  
  for (let i = 0; i < words.length - 1; i++) {
    const currentWord = words[i].toLowerCase()
    const nextWord = words[i + 1]
    
    if (isMonth(currentWord) && isYear(nextWord)) {
      dates.push(`${capitalizeMonth(currentWord)} ${nextWord}`)
      i++ // Skip the next word since we already used it
    }
  }
  
  return dates.length >= 2 ? dates.slice(0, 2) : null
}

/**
 * Checks if a word is a month
 */
function isMonth(word: string): boolean {
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ]
  return months.includes(word)
}

/**
 * Checks if a word is a year (4 digits)
 */
function isYear(word: string): boolean {
  return /^\d{4}$/.test(word)
}

/**
 * Capitalizes the first letter of the month
 */
function capitalizeMonth(month: string): string {
  return month.charAt(0).toUpperCase() + month.slice(1)
}

/**
 * Generates a simple query for a specific date range
 */
function generateSimpleQueryForDateRange(dateRange: string): string {
  return `show campaign performance for ${dateRange}` 
}

/**
 * POST /api/google-ads-v1/query
 *
 * Handles Google Ads V1 query requests
 *
 * Request body:
 * - query: Natural language query (e.g., "show campaign performance last 7 days")
 * - accounts: Account key from GOOGLE_ADS_ACCOUNTS
 *
 * Response:
 * - success: boolean
 * - query: Original user query
 * - account: Account information
 * - gaql_query: Generated GAQL query
 * - results: Processed result rows
 * - totals: Aggregated metrics (if applicable)
 * - execution_time_ms: Total execution time
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    logger.info(`[${requestId}] Google Ads V1 query request started`)

    // Parse request body
    const body: GoogleAdsV1Request = await request.json()
    logger.info(`[${requestId}] Request body received`, { body })

    const { query, accounts } = body

    // Validate query
    if (!query) {
      logger.error(`[${requestId}] No query provided in request`)
      return NextResponse.json({ error: 'No query provided' }, { status: 400 })
    }

    // Get account information
    const accountInfo = GOOGLE_ADS_ACCOUNTS[accounts]
    if (!accountInfo) {
      logger.error(`[${requestId}] Invalid account key`, {
        accounts,
        availableAccounts: Object.keys(GOOGLE_ADS_ACCOUNTS),
      })
      return NextResponse.json(
        {
          error: `Invalid account key: ${accounts}. Available accounts: ${Object.keys(GOOGLE_ADS_ACCOUNTS).join(', ')}`,
        },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] Found account`, {
      accountId: accountInfo.id,
      accountName: accountInfo.name,
    })

    // Check if this is a comparison query
    const isComparison = detectComparisonQuery(query)
    
    if (isComparison) {
      logger.info(`[${requestId}] Detected comparison query, executing dynamic comparison`)
      return await handleComparisonQuery(query, accounts, accountInfo, requestId)
    }

    // Generate GAQL query using AI
    const queryResult = await generateGAQLQuery(query)

    logger.info(`[${requestId}] Generated GAQL query`, {
      gaqlQuery: queryResult.gaql_query,
      queryType: queryResult.query_type,
      tables: queryResult.tables_used,
      metrics: queryResult.metrics_used,
    })

    // Execute the GAQL query against Google Ads API
    logger.info(`[${requestId}] Executing GAQL query against account ${accountInfo.id}`)
    const apiResult = await makeGoogleAdsRequest(accountInfo.id, queryResult.gaql_query)

    // Process results
    const processedResults = processResults(apiResult, requestId, logger)

    logger.info(`[${requestId}] Query executed successfully`, {
      rowCount: processedResults.row_count,
      totalRows: processedResults.total_rows,
      hasTotals: !!processedResults.totals,
    })

    const executionTime = Date.now() - startTime

    // Extract date range from GAQL query
    const dateRange = extractDateRange(queryResult.gaql_query)

    // Build response with pagination info
    const response = {
      success: true,
      query: query,
      account: {
        id: accountInfo.id,
        name: accountInfo.name,
      },
      gaql_query: queryResult.gaql_query,
      query_type: queryResult.query_type,
      tables_used: queryResult.tables_used,
      metrics_used: queryResult.metrics_used,
      date_range: dateRange
        ? {
            start_date: dateRange.startDate,
            end_date: dateRange.endDate,
          }
        : null,
      results: processedResults.rows,
      row_count: processedResults.row_count,
      total_rows: processedResults.total_rows,
      totals: processedResults.totals,
      execution_time_ms: executionTime,
    }

    return NextResponse.json(response)
  } catch (error) {
    const executionTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    logger.error(`[${requestId}] Google Ads V1 query failed`, {
      error: errorMessage,
      executionTime,
    })

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: 'Failed to process Google Ads V1 query',
        suggestion: 'Please check your query and try again.',
      },
      { status: 500 }
    )
  }
}
