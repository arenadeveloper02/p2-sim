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
 * Resolves account input to account key (supports both keys and numeric IDs)
 */
function resolveAccountKey(accountInput: string): string {
  // Try direct key match first (gentle_dental)
  if (GOOGLE_ADS_ACCOUNTS[accountInput]) {
    return accountInput
  }
  
  // If not found, search by numeric ID
  const foundAccount = Object.entries(GOOGLE_ADS_ACCOUNTS).find(
    ([key, account]) => account.id === accountInput
  )
  
  if (foundAccount) {
    logger.info(`Resolved numeric ID ${accountInput} to account key ${foundAccount[0]}`)
    return foundAccount[0]
  }
  
  // Return original if not found (will show error in validation)
  return accountInput
}

/**
 * Detects if a query is asking for comparison
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
 * AI-powered date and intent extraction for comparison queries
 */
async function extractDateRangesWithAI(query: string, requestId: string): Promise<{dateRanges: string[], intent: string} | null> {
  const prompt = `
Extract date ranges and user intent from this comparison query: "${query}"

Return JSON with both dates and intent:
{
  "dateRanges": ["Month YYYY", "Month YYYY"],
  "intent": "what the user wants to see (conversions, impressions, clicks, etc.)"
}

IMPORTANT RULES:
- Extract REAL dates mentioned in the query
- Extract the actual intent/metrics the user wants
- If no clear intent, use "campaign performance" as default
- Month must be full name (January, February, etc.)
- Year must be 4 digits (any year 1900-3000)
- CRITICAL: If user mentions "2024 vs 2025" with one month specified, extract BOTH with the same month. Example: "October 2024 vs 2025" → ["October 2024", "October 2025"]
- CRITICAL: Always extract the full month-year format, never just the year
- IMPORTANT: Convert M/D/YYYY format to Month YYYY format. Example: "1/1/2025 to 1/31/2025" → ["January 2025"]

Examples:
- "Compare October 2025 vs October 2024" → {"dateRanges": ["October 2025", "October 2024"], "intent": "campaign performance"}
- "Compare October 2024 vs 2025 Performance" → {"dateRanges": ["October 2024", "October 2025"], "intent": "campaign performance"}
- "Compare October 2025 vs October 2024, I want to see conversions" → {"dateRanges": ["October 2025", "October 2024"], "intent": "conversions"}
- "Show December 2025 compared to December 2024, give me impressions" → {"dateRanges": ["December 2025", "December 2024"], "intent": "impressions"}
- "November 2025 and November 2024 yoy for clicks" → {"dateRanges": ["November 2025", "November 2024"], "intent": "clicks"}
- "Compare 2019 vs 2018 conversions" → {"dateRanges": ["2019", "2018"], "intent": "conversions"}
- "Show me the performance from 1/1/2025 to 1/31/2025 and then 1/1/2026 to 1/31/2026" → {"dateRanges": ["January 2025", "January 2026"], "intent": "campaign performance"}
- "Compare last month vs same month last year" → null (no explicit dates)
`

  try {
    logger.info(`[${requestId}] Starting AI date extraction for query: "${query}"`)
    
    // Check environment variables
    logger.info(`[${requestId}] Environment variables check:`, {
      hasXAIKey: !!process.env.XAI_API_KEY,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      xaiKeyLength: process.env.XAI_API_KEY ? process.env.XAI_API_KEY.length : 0,
      openAIKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0
    })
    
    // Use the same AI provider as GAQL generation
    const { provider, model, apiKey } = resolveAIProvider(logger)
    
    logger.info(`[${requestId}] AI provider resolved:`, { provider, model, hasApiKey: !!apiKey })
    
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
      apiKey,
      temperature: 0.1,
      maxTokens: 2048,
    })
    
    logger.info(`[${requestId}] AI response received successfully`)
    
    // Extract content from AI response
    const responseContent = typeof aiResponse === 'string' 
      ? aiResponse 
      : 'content' in aiResponse 
        ? aiResponse.content 
        : JSON.stringify(aiResponse)
    
    let extractedData
    try {
      extractedData = JSON.parse(responseContent)
    } catch (parseError) {
      logger.error('AI returned invalid JSON:', responseContent)
      return null
    }
    
    // Validate AI response structure
    if (!extractedData || !extractedData.dateRanges || !Array.isArray(extractedData.dateRanges) || extractedData.dateRanges.length < 2) {
      return null
    }
    
    // Validate each date format
    const validDates = extractedData.dateRanges.filter((date: string) => {
      if (typeof date !== 'string') return false
      
      // Check if it matches "Month YYYY" format OR just "YYYY" (for years without months)
      const monthYearPattern = /^([A-Z][a-z]+) (\d{4})$/
      const yearOnlyPattern = /^(\d{4})$/
      
      let match = date.match(monthYearPattern)
      let month, year
      
      if (match) {
        month = match[1]
        year = match[2]
      } else {
        match = date.match(yearOnlyPattern)
        if (!match) return false
        month = null
        year = match[1]
      }
      
      // Validate month if present
      if (month) {
        const validMonths = ['January', 'February', 'March', 'April', 'May', 'June',
                            'July', 'August', 'September', 'October', 'November', 'December']
        if (!validMonths.includes(month)) return false
        
        // For M/D/YYYY format, check if the year exists in query (month name won't be in original)
        // For Month YYYY format, check both month and year
        const hasMonthInQuery = query.toLowerCase().includes(month.toLowerCase())
        const hasYearInQuery = query.includes(year)
        
        if (!hasYearInQuery) {
          logger.warn(`AI hallucinated year: ${year} not found in original query: ${query}`)
          return false
        }
        
        // If month is not in query, it's likely M/D/YYYY format conversion (which is valid)
        if (!hasMonthInQuery) {
          // Check if query has M/D/YYYY pattern for this month/year
          const monthNumber = new Date(`${month} 1, 2000`).getMonth() + 1
          const monthPattern = new RegExp(`${monthNumber}/\\d+/${year}`)
          if (!monthPattern.test(query)) {
            logger.warn(`AI hallucinated date: ${date} not found in original query: ${query}`)
            return false
          }
        }
      } else {
        // For year-only dates, verify the year exists in query
        if (!query.includes(year)) {
          logger.warn(`AI hallucinated year: ${year} not found in original query: ${query}`)
          return false
        }
      }
      
      // Validate year range (1900-3000)
      const yearNum = parseInt(year)
      if (yearNum < 1900 || yearNum > 3000) return false
      
      return true
    })
    
    if (validDates.length >= 2) {
      return {
        dateRanges: validDates.slice(0, 2),
        intent: extractedData.intent || 'campaign performance'
      }
    }
    
    return null
    
  } catch (error) {
    logger.error('AI date extraction failed:', error)
    return null
  }
}

/**
 * Handles comparison queries by generating two GAQL queries
 */
async function handleComparisonQuery(
  query: string, 
  accounts: string, 
  accountInfo: any, 
  requestId: string
): Promise<NextResponse> {
  try {
    logger.info(`[${requestId}] Processing comparison query: ${query}`)
    
    // Extract date ranges and intent using AI
    const extractionResult = await extractDateRangesWithAI(query, requestId)
    
    if (!extractionResult || !extractionResult.dateRanges || extractionResult.dateRanges.length < 2) {
      return NextResponse.json({
        error: 'AI API failed to extract date ranges. Please check your AI provider configuration (XAI_API_KEY or OPENAI_API_KEY) and try again.',
        details: 'The comparison functionality requires AI to extract dates and intent from your query.',
        example: 'Compare October 2025 vs October 2024'
      }, { status: 500 })
    }
    
    const { dateRanges, intent } = extractionResult
    const results = []
    
    // Generate and execute two GAQL queries
    for (const dateRange of dateRanges.slice(0, 2)) {
      // Create natural language query for this date range
      // Ensure proper date format and maintain comparison context for AI accuracy
      let formattedDateRange = dateRange
      if (!dateRange.includes(' ') && /^\d{4}$/.test(dateRange)) {
        // If it's just a year, add a month for better AI accuracy
        formattedDateRange = `January ${dateRange}` 
      }
      // Add comparison context to ensure both queries are equally accurate
      const naturalQuery = `show ${intent} for ${formattedDateRange} (comparison period)` 
      
      try {
        logger.info(`[${requestId}] Generating GAQL for: ${naturalQuery}`)
        logger.info(`[${requestId}] Original date range: ${dateRange}, Formatted: ${formattedDateRange}`)
        
        // Generate GAQL query using existing system
        const queryResult = await generateGAQLQuery(naturalQuery)
        
        logger.info(`[${requestId}] Generated GAQL: ${queryResult.gaql_query}`)
        logger.info(`[${requestId}] GAQL Query Type: ${queryResult.query_type}`)
        logger.info(`[${requestId}] GAQL Tables Used: ${JSON.stringify(queryResult.tables_used)}`)
        logger.info(`[${requestId}] GAQL Metrics Used: ${JSON.stringify(queryResult.metrics_used)}`)
        
        // Execute the GAQL query
        const apiResult = await makeGoogleAdsRequest(accountInfo.id, queryResult.gaql_query)
        
        // Process results
        const processedResults = processResults(apiResult, requestId, logger)
        
        logger.info(`[${requestId}] API Response for ${dateRange}:`, {
          rowCount: processedResults.row_count,
          totalRows: processedResults.total_rows,
          totals: processedResults.totals,
          sampleRows: processedResults.rows.slice(0, 2) // Show first 2 rows
        })
        
        results.push({
          dateRange: dateRange,
          naturalQuery: naturalQuery,
          gaqlQuery: queryResult.gaql_query,
          queryType: queryResult.query_type,
          tablesUsed: queryResult.tables_used,
          metricsUsed: queryResult.metrics_used,
          data: processedResults.rows,
          totals: processedResults.totals,
          rowCount: processedResults.row_count,
          totalRows: processedResults.total_rows
        })
        
        logger.info(`[${requestId}] Successfully executed query for ${dateRange}`, {
          rowCount: processedResults.row_count,
          hasTotals: !!processedResults.totals
        })
        
      } catch (error) {
        logger.error(`[${requestId}] Error executing query for ${dateRange}:`, error)
        results.push({
          dateRange: dateRange,
          naturalQuery: naturalQuery,
          error: error instanceof Error ? error.message : 'Unknown error',
          data: [],
          totals: {},
          rowCount: 0,
          totalRows: 0
        })
      }
    }
    
    const executionTime = Date.now() - Date.now()
    
    return NextResponse.json({
      success: true,
      query: query,
      account: {
        id: accountInfo.id,
        name: accountInfo.name
      },
      comparison: {
        type: 'date_comparison',
        intent: intent,
        periods: results
      },
      execution_time_ms: executionTime
    })
    
  } catch (error) {
    logger.error(`[${requestId}] Comparison query failed:`, error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Comparison query failed'
    }, { status: 500 })
  }
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

    // Resolve account input (supports both keys and numeric IDs)
    const resolvedAccountKey = resolveAccountKey(accounts)
    
    // Get account information
    const accountInfo = GOOGLE_ADS_ACCOUNTS[resolvedAccountKey]
    if (!accountInfo) {
      logger.error(`[${requestId}] Invalid account key or ID`, {
        accounts,
        resolvedAccountKey,
        availableAccounts: Object.keys(GOOGLE_ADS_ACCOUNTS),
      })
      return NextResponse.json(
        {
          error: `Invalid account key or ID: ${accounts}. Available accounts: ${Object.keys(GOOGLE_ADS_ACCOUNTS).join(', ')}`,
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
