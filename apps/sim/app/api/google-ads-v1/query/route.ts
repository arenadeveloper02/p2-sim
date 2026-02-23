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
import { resolveAIProvider } from './ai-provider'
import { extractDateRange, generateGAQLQuery } from './query-generation'
import { processResults } from './result-processing'
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
 * AI-powered query analysis — detects query type, extracts dates, intent, and comparison periods.
 * No hardcoded keywords, month lists, or regex patterns. AI decides everything.
 */
interface AIQueryAnalysis {
  isComparison: boolean
  intent: string
  periods: Array<{
    label: string
    startDate: string
    endDate: string
    naturalQuery: string
  }>
}

async function analyzeQueryWithAI(query: string, requestId: string): Promise<AIQueryAnalysis> {
  const today = new Date().toISOString().split('T')[0]

  const prompt = `You are an expert Google Ads query analyzer. Analyze the following user query and return a structured JSON response.

User query: "${query}"
Today's date: ${today}

Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{
  "isComparison": true/false,
  "intent": "what metrics/data the user wants (e.g. 'campaign performance', 'conversions', 'clicks', 'impressions', 'cost', 'ROAS')",
  "periods": [
    {
      "label": "human-readable label for this period (e.g. 'October 2024', 'Q1 2025', 'Last 7 days')",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "naturalQuery": "a clear natural language query for ONLY this period that can generate a GAQL query"
    }
  ]
}

RULES:
- "isComparison" is true if the user wants to compare two or more time periods. Use your understanding of language — don't rely on specific keywords.
- For comparisons, return exactly 2 periods. For single queries, return exactly 1 period.
- "intent" should capture what the user actually wants to see. If unclear, default to "campaign performance".
- All dates must be in YYYY-MM-DD format. Resolve relative dates (e.g. "last month", "yesterday") using today's date.
- "naturalQuery" for each period should be a standalone query that includes the date range and intent, suitable for generating a GAQL query independently.
- For month-based periods, startDate is the 1st and endDate is the last day of that month.
- For year-based periods, startDate is Jan 1 and endDate is Dec 31.
- For quarter-based periods (Q1, Q2, Q3, Q4), use the correct 3-month range.
- Handle ANY date format the user provides (M/D/YYYY, DD-MM-YYYY, "last week", "past 30 days", "this quarter", etc.)

CRITICAL FOR COMPARISONS - NO HALLUCINATIONS:
- For comparison queries, BOTH periods MUST use EXACTLY the same metrics, dimensions, and segmentations
- The "naturalQuery" for each period should be nearly identical except for the date range
- Example: If comparing "October 2024 vs October 2025 ROAS", both queries should request the same metrics (ROAS, cost, conversions, clicks, impressions)
- DO NOT hallucinate different metrics for different periods - use the same exact metrics for both
- If the user mentions specific metrics (ROAS, CPC, AOV, conversion rate), include ALL of them in BOTH periods
- If user mentions campaign types (Pmax, Brand, etc.), include the same campaign types in BOTH periods

Examples:
- "Compare October 2024 vs October 2025" → isComparison: true, 2 periods with Oct date ranges
- "Show me clicks last 7 days" → isComparison: false, 1 period
- "How did Q1 2025 perform against Q1 2024" → isComparison: true, 2 periods with quarter ranges
- "Year over year performance 2024 vs 2025" → isComparison: true, 2 full-year periods
- "What happened with conversions from 1/1/2025 to 3/31/2025 compared to same period 2024" → isComparison: true, 2 periods
- "Show campaign performance" → isComparison: false, 1 period (default to last 30 days)
`

  try {
    logger.info(`[${requestId}] Analyzing query with AI: "${query}"`)

    const { provider, model, apiKey } = resolveAIProvider(logger)

    logger.info(`[${requestId}] AI provider resolved:`, { provider, model, hasApiKey: !!apiKey })

    const aiResponse = await executeProviderRequest(provider, {
      model,
      systemPrompt:
        'You are a Google Ads query analyzer. Return ONLY valid JSON, no markdown fences or extra text.',
      context: `Analyze this Google Ads query: "${query}"`,
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

    logger.info(`[${requestId}] AI analysis response received`)

    // Extract content from AI response
    let responseContent =
      typeof aiResponse === 'string'
        ? aiResponse
        : 'content' in aiResponse
          ? aiResponse.content
          : JSON.stringify(aiResponse)

    // Strip markdown code fences if AI included them
    responseContent = responseContent
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()

    let analysis: AIQueryAnalysis
    try {
      analysis = JSON.parse(responseContent)
    } catch (parseError) {
      logger.error(`[${requestId}] AI returned invalid JSON:`, responseContent)
      throw new Error(`AI API returned invalid JSON. Response: ${responseContent}`)
    }

    // Basic structural validation — fail fast if AI returns invalid structure
    if (!analysis.periods || !Array.isArray(analysis.periods) || analysis.periods.length === 0) {
      logger.error(`[${requestId}] AI returned invalid or empty periods:`, analysis)
      throw new Error(`AI API failed to extract valid periods from query: "${query}"`)
    }

    logger.info(`[${requestId}] AI analysis complete:`, {
      isComparison: analysis.isComparison,
      intent: analysis.intent,
      periodCount: analysis.periods.length,
      periods: analysis.periods.map((p) => ({
        label: p.label,
        startDate: p.startDate,
        endDate: p.endDate,
      })),
    })

    return analysis
  } catch (error) {
    logger.error(`[${requestId}] AI query analysis failed:`, error)
    throw new Error(
      `AI query analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Executes a comparison query using AI-analyzed periods
 */
async function handleComparisonQuery(
  query: string,
  analysis: AIQueryAnalysis,
  accountInfo: any,
  requestId: string
): Promise<NextResponse> {
  const comparisonStartTime = Date.now()

  try {
    logger.info(`[${requestId}] Processing comparison query: ${query}`)
    logger.info(`[${requestId}] AI detected ${analysis.periods.length} periods to compare`)
    logger.info(`[${requestId}] Period queries:`, {
      period1: analysis.periods[0]?.naturalQuery,
      period2: analysis.periods[1]?.naturalQuery,
    })

    const results = []

    for (const period of analysis.periods) {
      try {
        logger.info(`[${requestId}] Generating GAQL for period: ${period.label}`)
        logger.info(`[${requestId}] Natural query: ${period.naturalQuery}`)
        logger.info(`[${requestId}] Date range: ${period.startDate} to ${period.endDate}`)

        // Generate GAQL query using existing system — AI already crafted the naturalQuery
        const queryResult = await generateGAQLQuery(period.naturalQuery)

        logger.info(`[${requestId}] Generated GAQL: ${queryResult.gaql_query}`)

        // Execute the GAQL query
        const apiResult = await makeGoogleAdsRequest(accountInfo.id, queryResult.gaql_query)

        // Process results
        const processedResults = processResults(apiResult, requestId, logger)

        logger.info(`[${requestId}] Results for ${period.label}:`, {
          rowCount: processedResults.row_count,
          totalRows: processedResults.total_rows,
        })

        results.push({
          dateRange: period.label,
          startDate: period.startDate,
          endDate: period.endDate,
          naturalQuery: period.naturalQuery,
          gaqlQuery: queryResult.gaql_query,
          queryType: queryResult.query_type,
          tablesUsed: queryResult.tables_used,
          metricsUsed: queryResult.metrics_used,
          data: processedResults.rows,
          totals: processedResults.totals,
          rowCount: processedResults.row_count,
          totalRows: processedResults.total_rows,
        })
      } catch (error) {
        logger.error(`[${requestId}] Error executing query for ${period.label}:`, error)
        results.push({
          dateRange: period.label,
          startDate: period.startDate,
          endDate: period.endDate,
          naturalQuery: period.naturalQuery,
          error: error instanceof Error ? error.message : 'Unknown error',
          data: [],
          totals: {},
          rowCount: 0,
          totalRows: 0,
        })
      }
    }

    const executionTime = Date.now() - comparisonStartTime

    return NextResponse.json({
      success: true,
      query: query,
      account: {
        id: accountInfo.id,
        name: accountInfo.name,
      },
      comparison: {
        type: 'date_comparison',
        intent: analysis.intent,
        periods: results,
      },
      execution_time_ms: executionTime,
    })
  } catch (error) {
    logger.error(`[${requestId}] Comparison query failed:`, error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Comparison query failed',
      },
      { status: 500 }
    )
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

    // AI analyzes the query — detects comparison, extracts dates, intent, everything
    const analysis = await analyzeQueryWithAI(query, requestId)

    if (analysis.isComparison) {
      logger.info(`[${requestId}] AI detected comparison query, executing dynamic comparison`)
      return await handleComparisonQuery(query, analysis, accountInfo, requestId)
    }

    // Single query — use AI-crafted naturalQuery
    const effectiveQuery = analysis.periods[0]?.naturalQuery
    if (!effectiveQuery) {
      throw new Error(`AI failed to generate a valid natural query for: "${query}"`)
    }

    // Generate GAQL query using AI
    const queryResult = await generateGAQLQuery(effectiveQuery)

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
