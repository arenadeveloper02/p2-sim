import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { executeProviderRequest } from '@/providers'
import { getApiKey } from '@/providers/utils'
import { detectSitelinkQuery, extractSitelinkComponents, generateSitelinkGAQL, processSitelinkData } from '../helpers/sitelinks'
import { detectPPCTemplate, extractPPCParameters, isPPCTemplateQuery } from '../helpers/ppc-detection'
import { PPCTemplateProcessor } from '../helpers/template-processor'
import { getAccountId, GOOGLE_ADS_ACCOUNTS } from '../helpers/utils'
import { isDeepAnalysisRequest } from '../helpers/ai-analysis'

const logger = createLogger('GoogleAdsAPI')

// Accounts are now imported from helpers/utils

// Position2 Manager MCC for login
const POSITION2_MANAGER = '4455285084'

interface GoogleAdsRequest {
  query: string
  accounts: string
  period_type?: string
  output_format?: string
  sort_by?: string
  custom_start_date?: string
  custom_end_date?: string
}

interface Campaign {
  name: string
  status: string
  clicks: number
  impressions: number
  cost: number
  conversions: number
  conversions_value: number
  ctr: number
  avg_cpc: number
  cost_per_conversion: number
  conversion_rate: number
  impression_share: number
  budget_lost_share: number
  rank_lost_share: number
  roas: number
}

interface AccountResult {
  account_id: string
  account_name: string
  campaigns: Campaign[]
  total_campaigns: number
  account_totals: {
    clicks: number
    impressions: number
    cost: number
    conversions: number
    ctr: number
    avg_cpc: number
    conversion_rate: number
    cost_per_conversion: number
  }
  error?: string
}

async function generateSmartGAQL(
  userQuestion: string,
  accountName: string
): Promise<{
  gaqlQuery: string
  periodType: string
  queryType: string
  startDate: string
  endDate: string
  isComparison?: boolean
  comparisonQuery?: string
  comparisonStartDate?: string
  comparisonEndDate?: string
}> {
  logger.info('Generating complete GAQL query with AI', { userQuestion, accountName })

  try {
    // Use AI to generate complete GAQL query directly
    const aiResult = await generateGAQLWithAI(userQuestion)
    logger.info('AI GAQL generation successful', {
      queryType: aiResult.queryType,
      periodType: aiResult.periodType,
      startDate: aiResult.startDate,
      endDate: aiResult.endDate,
      gaqlLength: aiResult.gaqlQuery.length,
      isComparison: aiResult.isComparison,
    })

    return {
      gaqlQuery: aiResult.gaqlQuery,
      queryType: aiResult.queryType,
      periodType: aiResult.periodType,
      startDate: aiResult.startDate,
      endDate: aiResult.endDate,
      isComparison: aiResult.isComparison,
      comparisonQuery: aiResult.comparisonQuery,
      comparisonStartDate: aiResult.comparisonStartDate,
      comparisonEndDate: aiResult.comparisonEndDate,
    }
  } catch (error) {
    logger.error('AI GAQL generation failed', { error, userQuestion, accountName })
    throw new Error(`Failed to generate GAQL query: ${error}`)
  }
}

async function generateGAQLWithAI(userInput: string): Promise<{
  gaqlQuery: string
  queryType: string
  periodType: string
  startDate: string
  endDate: string
  isComparison?: boolean
  comparisonQuery?: string
  comparisonStartDate?: string
  comparisonEndDate?: string
}> {
  logger.info('Generating complete GAQL query with AI', { userInput })

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const systemPrompt = `You are an expert Google Ads Query Language (GAQL) generator. You MUST always generate a valid GAQL query from ANY Google Ads related question.

AVAILABLE RESOURCES:
- campaign (campaign.name, campaign.status, campaign.id)
- ad_group (ad_group.name, ad_group.status, ad_group.id)  
- ad_group_criterion (for keywords: ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type)
- keyword_view (for keyword performance data)

AVAILABLE METRICS:
- metrics.clicks, metrics.impressions, metrics.cost_micros
- metrics.conversions, metrics.conversions_value
- metrics.ctr, metrics.average_cpc, metrics.cost_per_conversion
- metrics.search_impression_share, metrics.search_budget_lost_impression_share
- metrics.search_rank_lost_impression_share

MANDATORY RULES:
1. ALWAYS generate a valid GAQL query - never return error messages
2. Use segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD' for date filtering
3. Always include campaign.status != 'REMOVED' in WHERE clause
4. For keywords, use keyword_view resource
5. For campaigns, use campaign resource
6. Calculate actual dates based on current date: ${todayStr}
7. **CRITICAL**: DO NOT use GROUP BY - GAQL automatically aggregates metrics by selected dimensions
8. **SYNTAX RULES**:
   - DO NOT use parentheses () except in BETWEEN clauses
   - DO NOT use brackets [], braces {}, or angle brackets <>
   - Use only valid GAQL field names (no functions, no calculations)
   - Keep queries simple and clean
   - Field names should be exact: campaign.name, metrics.clicks, etc.

COMPARISON QUERIES:
If the user asks for a comparison (e.g., "this month vs last month", "compare January to February", "week 1 vs week 2"), you MUST:
1. Set "is_comparison": true
2. Provide the primary period query in "gaql_query"
3. Provide the comparison period query in "comparison_query"
4. Set appropriate date ranges for both periods

EXAMPLE QUERIES:
- Campaign impressions: "SELECT campaign.name, metrics.impressions FROM campaign WHERE segments.date BETWEEN '2025-01-01' AND '2025-01-31' AND campaign.status != 'REMOVED' ORDER BY metrics.impressions DESC"
- Campaign clicks: "SELECT campaign.name, metrics.clicks FROM campaign WHERE segments.date BETWEEN '2024-09-01' AND '2024-09-17' AND campaign.status != 'REMOVED' ORDER BY metrics.clicks DESC"
- Keyword performance: "SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, metrics.clicks FROM keyword_view WHERE segments.date BETWEEN '2024-09-01' AND '2024-09-17' AND campaign.status != 'REMOVED' ORDER BY metrics.clicks DESC"

TIME PERIOD CALCULATIONS (based on current date ${todayStr}):
- "January 2025" = '2025-01-01' to '2025-01-31'
- "today" = '${todayStr}' to '${todayStr}'
- "yesterday" = previous day to previous day
- "last 7 days" = 7 days ago to yesterday  
- "last 30 days" = 30 days ago to yesterday
- "this month" = first day of current month to today
- "last month" = first day to last day of previous month

IMPORTANT: You must ALWAYS return valid JSON with a GAQL query. Never return error messages or refuse to generate a query.

**CRITICAL**: Return EXACTLY ONE JSON object. Do not return multiple JSON objects or any additional text.

Return JSON format for SINGLE PERIOD:
{
  "gaql_query": "SELECT campaign.name, metrics.impressions FROM campaign WHERE segments.date BETWEEN '2025-01-01' AND '2025-01-31' AND campaign.status != 'REMOVED' ORDER BY metrics.impressions DESC",
  "query_type": "campaigns",
  "period_type": "custom_january_2025", 
  "start_date": "2025-01-01",
  "end_date": "2025-01-31",
  "is_comparison": false
}

Return JSON format for COMPARISON:
{
  "gaql_query": "SELECT campaign.name, metrics.impressions FROM campaign WHERE segments.date BETWEEN '2025-01-01' AND '2025-01-31' AND campaign.status != 'REMOVED' ORDER BY metrics.impressions DESC",
  "comparison_query": "SELECT campaign.name, metrics.impressions FROM campaign WHERE segments.date BETWEEN '2024-12-01' AND '2024-12-31' AND campaign.status != 'REMOVED' ORDER BY metrics.impressions DESC",
  "query_type": "campaigns",
  "period_type": "this_month_vs_last_month",
  "start_date": "2025-01-01",
  "end_date": "2025-01-31",
  "comparison_start_date": "2024-12-01",
  "comparison_end_date": "2024-12-31",
  "is_comparison": true
}`

  try {
    // Get API key for OpenAI hosted provider
    let apiKey: string
    try {
      // Pass the OpenAI API key from environment for local development
      const openaiKey = process.env.OPENAI_API_KEY_1 || process.env.OPENAI_API_KEY
      apiKey = getApiKey('openai', 'gpt-4o', openaiKey)
    } catch (keyError) {
      logger.error('Failed to get OpenAI API key', { keyError })
      throw new Error('OpenAI API key not available')
    }

    logger.info('Making AI request for query parsing', {
      hasApiKey: !!apiKey,
      model: 'gpt-4o',
    })

    const aiResponse = await executeProviderRequest('openai', {
      model: 'gpt-4o',
      systemPrompt: `${systemPrompt}\n\nRespond with EXACTLY ONE valid JSON object. No additional text, no multiple JSON objects, no explanations.`,
      context: `Parse this Google Ads question: "${userInput}"`,
      messages: [
        {
          role: 'user',
          content: `Parse this Google Ads question: "${userInput}"`,
        },
      ],
      apiKey,
      temperature: 0.1,
      maxTokens: 500,
    })

    // Extract content from AI response
    let aiContent = ''
    if (typeof aiResponse === 'object' && aiResponse !== null) {
      if ('content' in aiResponse) {
        aiContent = aiResponse.content as string
      } else if (
        'output' in aiResponse &&
        aiResponse.output &&
        typeof aiResponse.output === 'object' &&
        'content' in aiResponse.output
      ) {
        aiContent = aiResponse.output.content as string
      }
    }
    logger.info('AI Content', { aiContent })

    // Check if AI returned an error message instead of JSON
    if (aiContent.includes('"error"') && !aiContent.includes('"gaql_query"')) {
      logger.error('AI returned error instead of GAQL query', { aiContent })
      throw new Error(`AI refused to generate query: ${aiContent}`)
    }

    // Parse AI response - handle multiple JSON objects if present
    const cleanedContent = aiContent.replace(/```json\n?|\n?```/g, '').trim()
    let parsedResponse

    try {
      // First, try to parse as single JSON
      parsedResponse = JSON.parse(cleanedContent)
    } catch (parseError) {
      // If that fails, try to extract the first valid JSON object from multiple objects
      logger.warn('Failed to parse as single JSON, trying to extract first valid JSON object', {
        aiContent: `${cleanedContent.substring(0, 200)}...`,
        parseError,
      })
    }

    // Validate required fields
    if (!parsedResponse.gaql_query) {
      logger.error('AI response missing gaql_query field', { parsedResponse })
      throw new Error(`AI response missing GAQL query: ${JSON.stringify(parsedResponse)}`)
    }

    // Clean and validate the AI-generated GAQL query
    let cleanedGaqlQuery = parsedResponse.gaql_query || ''

    // Remove any malformed characters or syntax
    cleanedGaqlQuery = cleanedGaqlQuery
      .replace(/```sql\n?|\n?```/g, '') // Remove SQL code blocks
      .replace(/```gaql\n?|\n?```/g, '') // Remove GAQL code blocks
      .replace(/```\n?|\n?```/g, '') // Remove any other code blocks
      .trim()

    // Remove invalid GROUP BY clauses (GAQL doesn't support GROUP BY)
    cleanedGaqlQuery = cleanedGaqlQuery.replace(/\s+GROUP\s+BY\s+[^ORDER\s]+/gi, '')

    // Validate that the query doesn't contain invalid characters
    const hasInvalidChars = /[(){}[\]<>]/.test(
      cleanedGaqlQuery.replace(/BETWEEN '[^']*' AND '[^']*'/g, '')
    ) // Allow parentheses in BETWEEN clauses
    const hasGroupBy = /\bGROUP\s+BY\b/i.test(cleanedGaqlQuery)

    if (hasInvalidChars || hasGroupBy || !cleanedGaqlQuery.toUpperCase().includes('SELECT')) {
      logger.error('AI generated invalid GAQL query', {
        originalQuery: parsedResponse.gaql_query,
        cleanedQuery: cleanedGaqlQuery,
        hasInvalidChars,
        hasGroupBy,
        hasSelect: cleanedGaqlQuery.toUpperCase().includes('SELECT'),
      })
      throw new Error(`AI generated invalid GAQL query: ${parsedResponse.gaql_query}`)
    }

    logger.info('AI generated GAQL successfully', {
      query_type: parsedResponse.query_type,
      period_type: parsedResponse.period_type,
      start_date: parsedResponse.start_date,
      end_date: parsedResponse.end_date,
      original_gaql: parsedResponse.gaql_query,
      cleaned_gaql: cleanedGaqlQuery,
    })

    return {
      gaqlQuery: cleanedGaqlQuery,
      queryType: parsedResponse.query_type || 'campaigns',
      periodType: parsedResponse.period_type || 'last_30_days',
      startDate:
        parsedResponse.start_date ||
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: parsedResponse.end_date || new Date().toISOString().split('T')[0],
      isComparison: parsedResponse.is_comparison || false,
      comparisonQuery: parsedResponse.comparison_query,
      comparisonStartDate: parsedResponse.comparison_start_date,
      comparisonEndDate: parsedResponse.comparison_end_date,
    }
  } catch (error) {
    logger.error('AI query parsing failed, using manual fallback', { error })
    throw error // Let the calling function handle the fallback
  }
}

function calculateDynamicDates(periodType: string): { startDate: string; endDate: string } {
  const today = new Date()
  let startDate: Date
  let endDate: Date

  switch (periodType) {
    case 'today':
      startDate = new Date(today)
      endDate = new Date(today)
      break
    case 'yesterday':
      startDate = new Date(today)
      startDate.setDate(today.getDate() - 1)
      endDate = new Date(startDate)
      break
    case 'last_7_days':
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1)
      startDate = new Date(endDate)
      startDate.setDate(endDate.getDate() - 6)
      break
    case 'last_15_days':
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1)
      startDate = new Date(endDate)
      startDate.setDate(endDate.getDate() - 14)
      break
    case 'last_30_days':
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1) // Yesterday
      startDate = new Date(endDate)
      startDate.setDate(endDate.getDate() - 29) // 30 days total
      break
    case 'this_week': {
      // Start of current week (Monday)
      const currentDay = today.getDay()
      const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay
      startDate = new Date(today)
      startDate.setDate(today.getDate() + mondayOffset)
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1)
      break
    }
    case 'last_week': {
      // Previous week (Monday to Sunday)
      const lastWeekEnd = new Date(today)
      const daysToLastSunday = today.getDay() === 0 ? 7 : today.getDay()
      lastWeekEnd.setDate(today.getDate() - daysToLastSunday)
      endDate = lastWeekEnd
      startDate = new Date(lastWeekEnd)
      startDate.setDate(lastWeekEnd.getDate() - 6)
      break
    }
    case 'this_month':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1)
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1)
      break
    case 'last_month': {
      const firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      endDate = new Date(firstThisMonth)
      endDate.setDate(firstThisMonth.getDate() - 1)
      startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
      break
    }
    case 'last_90_days':
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1)
      startDate = new Date(endDate)
      startDate.setDate(endDate.getDate() - 89)
      break
    case 'this_year':
      startDate = new Date(today.getFullYear(), 0, 1)
      endDate = new Date(today)
      endDate.setDate(today.getDate() - 1)
      break
    case 'last_year':
      startDate = new Date(today.getFullYear() - 1, 0, 1)
      endDate = new Date(today.getFullYear() - 1, 11, 31)
      break
    default:
      // Handle custom number of days (e.g., "last_45_days")
      if (periodType.startsWith('last_') && periodType.endsWith('_days')) {
        const daysMatch = periodType.match(/last_(\d+)_days/)
        if (daysMatch) {
          const numDays = Number.parseInt(daysMatch[1])
          endDate = new Date(today)
          endDate.setDate(today.getDate() - 1)
          startDate = new Date(endDate)
          startDate.setDate(endDate.getDate() - (numDays - 1))
        } else {
          // Fallback to last 30 days
          endDate = new Date(today)
          endDate.setDate(today.getDate() - 1)
          startDate = new Date(endDate)
          startDate.setDate(endDate.getDate() - 29)
        }
      } else {
        // Default to last 30 days
        endDate = new Date(today)
        endDate.setDate(today.getDate() - 1)
        startDate = new Date(endDate)
        startDate.setDate(endDate.getDate() - 29)
      }
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  }
}

async function makeGoogleAdsRequest(accountId: string, gaqlQuery: string): Promise<any> {
  logger.info('Making real Google Ads API request', { accountId, gaqlQuery })

  try {
    // Get Google Ads API credentials from environment variables
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN

    if (!clientId || !clientSecret || !refreshToken || !developerToken) {
      throw new Error(
        'Missing Google Ads API credentials. Please set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_ADS_REFRESH_TOKEN environment variables.'
      )
    }

    logger.info('Using Google Ads credentials', {
      developerToken: `${developerToken.substring(0, 10)}...`,
      clientId: `${clientId.substring(0, 30)}...`,
      clientIdFull: clientId, // Log full client ID for debugging
      hasClientSecret: !!clientSecret,
      hasRefreshToken: !!refreshToken,
      clientSecretLength: clientSecret.length,
      refreshTokenLength: refreshToken.length,
    })

    // Prepare token request body
    const tokenRequestBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })

    logger.info('Token request details', {
      url: 'https://oauth2.googleapis.com/token',
      bodyParams: {
        client_id: clientId,
        grant_type: 'refresh_token',
        hasClientSecret: !!clientSecret,
        hasRefreshToken: !!refreshToken,
      },
    })

    // Get access token using refresh token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody,
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      logger.error('Token refresh failed', {
        status: tokenResponse.status,
        error: errorText,
        clientId: `${clientId.substring(0, 20)}...`,
      })
      throw new Error(
        `Failed to refresh Google Ads access token: ${tokenResponse.status} - ${errorText}`
      )
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    logger.info('Successfully obtained access token')

    // Format customer ID (remove dashes if present)
    const formattedCustomerId = accountId.replace(/-/g, '')

    // Make Google Ads API request
    const adsApiUrl = `https://googleads.googleapis.com/v19/customers/${formattedCustomerId}/googleAds:search`

    const requestPayload = {
      query: gaqlQuery.trim(),
    }

    logger.info('Making Google Ads API request', {
      url: adsApiUrl,
      customerId: formattedCustomerId,
      query: gaqlQuery.trim(),
      managerCustomerId: POSITION2_MANAGER,
    })

    const adsResponse = await fetch(adsApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': POSITION2_MANAGER,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    })

    if (!adsResponse.ok) {
      const errorText = await adsResponse.text()
      logger.error('Google Ads API request failed', {
        status: adsResponse.status,
        error: errorText,
        customerId: formattedCustomerId,
        managerCustomerId: POSITION2_MANAGER,
      })
      throw new Error(`Google Ads API request failed: ${adsResponse.status} - ${errorText}`)
    }

    const adsData = await adsResponse.json()
    logger.info('Google Ads API request successful', {
      resultsCount: adsData.results?.length || 0,
      customerId: formattedCustomerId,
      responseKeys: Object.keys(adsData),
      hasResults: !!adsData.results,
      firstResultKeys: adsData.results?.[0] ? Object.keys(adsData.results[0]) : [],
    })

    // Log a sample of the response structure for debugging
    if (adsData.results?.[0]) {
      logger.debug('Sample Google Ads API response structure', {
        sampleResult: {
          keys: Object.keys(adsData.results[0]),
          campaign: adsData.results[0].campaign ? Object.keys(adsData.results[0].campaign) : null,
          metrics: adsData.results[0].metrics ? Object.keys(adsData.results[0].metrics) : null,
          segments: adsData.results[0].segments ? Object.keys(adsData.results[0].segments) : null,
        },
      })
    }

    return adsData
  } catch (error) {
    logger.error('Error in Google Ads API request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      accountId,
    })
    throw error
  }
}

function processGoogleAdsResults(
  apiResult: any,
  requestId: string,
  periodLabel = 'primary'
): {
  campaigns: Campaign[]
  accountTotals: {
    clicks: number
    impressions: number
    cost: number
    conversions: number
  }
} {
  const campaigns: Campaign[] = []
  let accountClicks = 0
  let accountImpressions = 0
  let accountCost = 0
  let accountConversions = 0

  if (apiResult.results && Array.isArray(apiResult.results)) {
    logger.info(
      `[${requestId}] Processing ${apiResult.results.length} results from Google Ads API (${periodLabel} period)`
    )

    for (const result of apiResult.results) {
      // Log the structure of each result to understand the API response format
      logger.debug(`[${requestId}] Processing result (${periodLabel})`, {
        resultKeys: Object.keys(result),
        hasCampaign: !!result.campaign,
        hasMetrics: !!result.metrics,
        campaignKeys: result.campaign ? Object.keys(result.campaign) : [],
        metricsKeys: result.metrics ? Object.keys(result.metrics) : [],
      })

      const campaignData = result.campaign
      const metricsData = result.metrics

      // Add safety checks for undefined metricsData
      if (!metricsData) {
        logger.warn(`[${requestId}] Skipping result with missing metrics data (${periodLabel})`, {
          resultKeys: Object.keys(result),
          campaignName: campaignData?.name || 'Unknown',
        })
        continue
      }

      const clicks = Number.parseInt(metricsData.clicks || '0')
      const impressions = Number.parseInt(metricsData.impressions || '0')
      const costMicros = Number.parseInt(metricsData.costMicros || '0')
      const conversions = Number.parseFloat(metricsData.conversions || '0')
      const conversionsValue = Number.parseFloat(metricsData.conversionsValue || '0')
      const avgCpcMicros = Number.parseInt(metricsData.averageCpc || '0')
      const costPerConversionMicros = Number.parseInt(metricsData.costPerConversion || '0')
      const impressionShare = Number.parseFloat(metricsData.searchImpressionShare || '0')
      const budgetLostShare = Number.parseFloat(metricsData.searchBudgetLostImpressionShare || '0')
      const rankLostShare = Number.parseFloat(metricsData.searchRankLostImpressionShare || '0')

      // Calculate conversion rate manually (conversions / clicks * 100)
      const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0

      accountClicks += clicks
      accountImpressions += impressions
      accountCost += costMicros
      accountConversions += conversions

      const campaignInfo: Campaign = {
        name: campaignData.name || 'Unknown',
        status: campaignData.status || 'Unknown',
        clicks,
        impressions,
        cost: Math.round((costMicros / 1000000) * 100) / 100,
        conversions,
        conversions_value: Math.round(conversionsValue * 100) / 100,
        ctr: Math.round(Number.parseFloat(metricsData.ctr || '0') * 10000) / 100,
        avg_cpc: Math.round((avgCpcMicros / 1000000) * 100) / 100,
        cost_per_conversion:
          costPerConversionMicros > 0
            ? Math.round((costPerConversionMicros / 1000000) * 100) / 100
            : 0,
        conversion_rate: Math.round(conversionRate * 100) / 100,
        impression_share: Math.round(impressionShare * 10000) / 100,
        budget_lost_share: Math.round(budgetLostShare * 10000) / 100,
        rank_lost_share: Math.round(rankLostShare * 10000) / 100,
        roas:
          costMicros > 0 ? Math.round((conversionsValue / (costMicros / 1000000)) * 100) / 100 : 0,
      }
      campaigns.push(campaignInfo)
    }
  } else {
    logger.warn(`[${requestId}] No results found in Google Ads API response (${periodLabel})`, {
      hasResults: !!apiResult.results,
      resultsType: typeof apiResult.results,
      isArray: Array.isArray(apiResult.results),
      apiResultKeys: Object.keys(apiResult),
    })
  }

  return {
    campaigns,
    accountTotals: {
      clicks: accountClicks,
      impressions: accountImpressions,
      cost: Math.round((accountCost / 1000000) * 100) / 100,
      conversions: accountConversions,
    },
  }
}

/**
 * Handle sitelink-specific queries
 */
async function handlePPCTemplateQuery(
  query: string,
  templateId: string,
  accountInfo: { id: string; name: string },
  requestId: string
) {
  try {
    logger.info(`[${requestId}] Processing PPC template query`, { 
      templateId, 
      query, 
      accountName: accountInfo.name 
    })

    // Extract parameters from the query
    const params = extractPPCParameters(query, templateId)
    
    // Add the current account to params if not already specified
    if (!params.accounts) {
      // Map account name to key
      const accountKey = Object.keys(GOOGLE_ADS_ACCOUNTS).find(
        key => GOOGLE_ADS_ACCOUNTS[key].name === accountInfo.name
      )
      params.accounts = accountKey || accountInfo.name.toLowerCase().replace(/\s+/g, '_')
    }

    logger.info(`[${requestId}] Extracted PPC parameters`, { templateId, params })

    // Process the template
    const result = await PPCTemplateProcessor.processTemplate(templateId, params)
    
    logger.info(`[${requestId}] PPC template processing completed`, { 
      templateId,
      accountCount: result.accounts.length,
      hasData: result.data.length > 0
    })

    return NextResponse.json(result)

  } catch (error) {
    logger.error(`[${requestId}] PPC template processing failed`, { 
      templateId,
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json(
      { 
        error: 'PPC template processing failed',
        details: error instanceof Error ? error.message : String(error),
        templateId
      },
      { status: 500 }
    )
  }
}

async function handleSitelinkQuery(
  query: string, 
  accountInfo: { id: string; name: string }, 
  requestId: string
) {
  try {
    logger.info(`[${requestId}] Processing sitelink query`, { query, accountName: accountInfo.name })

    // Extract sitelink query components
    const components = extractSitelinkComponents(query)
    logger.info(`[${requestId}] Extracted sitelink components`, { components })

    // Generate sitelink GAQL query
    const gaqlQuery = generateSitelinkGAQL(components, accountInfo.id)
    logger.info(`[${requestId}] Generated sitelink GAQL`, { gaqlQuery })

    // Make Google Ads API request
    const apiResponse = await makeGoogleAdsRequest(accountInfo.id, gaqlQuery)
    logger.info(`[${requestId}] Received sitelink API response`, { 
      apiResponse: apiResponse,
      dataType: typeof apiResponse,
      isArray: Array.isArray(apiResponse),
      dataLength: apiResponse?.length || 0,
      keys: typeof apiResponse === 'object' ? Object.keys(apiResponse || {}) : 'Not object'
    })

    // Process sitelink data
    const sitelinkResponse = processSitelinkData(
      apiResponse || [], 
      accountInfo.name, 
      components.campaign
    )

    logger.info(`[${requestId}] Processed sitelink data`, { 
      sitelinksCount: sitelinkResponse.sitelinks.length 
    })

    return NextResponse.json(sitelinkResponse)

  } catch (error) {
    logger.error(`[${requestId}] Sitelink query failed`, { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    })

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: 'Failed to process sitelink query',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    logger.info(`[${requestId}] Google Ads query request started`)

    const body: GoogleAdsRequest = await request.json()
    logger.info(`[${requestId}] Request body received`, { body })

    const { query, accounts, period_type, output_format = 'detailed', sort_by = 'cost_desc' } = body

    if (!query) {
      logger.error(`[${requestId}] No query provided in request`)
      return NextResponse.json({ error: 'No query provided' }, { status: 400 })
    }

    logger.info(`[${requestId}] Processing query`, { query, accounts, period_type })

    // Get account information first
    logger.info(`[${requestId}] Looking up account`, {
      accounts,
      availableAccounts: Object.keys(GOOGLE_ADS_ACCOUNTS),
    })

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

    // NEW: Check if this is a deep analysis request (multi-month, CPL analysis, etc.)
    if (isDeepAnalysisRequest(query)) {
      logger.info(`[${requestId}] Detected deep analysis request, redirecting to analysis endpoint`)
      return NextResponse.json({
        success: true,
        message: 'Deep analysis request detected. Use /api/google-ads/analyze endpoint for this type of request.',
        analysisType: 'deep_dive',
        suggestion: 'This request requires multi-query orchestration and AI analysis. Please use the analyze endpoint.',
        accountId: accountInfo.id,
        accountName: accountInfo.name
      })
    }

    // Check if this is a sitelink query
    const isSitelinkQuery = detectSitelinkQuery(query)
    logger.info(`[${requestId}] Sitelink detection check`, { 
      query, 
      isSitelinkQuery,
      queryLower: query.toLowerCase()
    })
    
    if (isSitelinkQuery) {
      logger.info(`[${requestId}] Detected sitelink query, processing with sitelink handler`)
      return await handleSitelinkQuery(query, accountInfo, requestId)
    }

    // Check if this is a PPC template query
    const ppcTemplateId = detectPPCTemplate(query)
    if (ppcTemplateId) {
      logger.info(`[${requestId}] Detected PPC template query`, { templateId: ppcTemplateId })
      return await handlePPCTemplateQuery(query, ppcTemplateId, accountInfo, requestId)
    }

    // Use smart parsing to generate GAQL query based on the user's question
    const {
      gaqlQuery,
      periodType,
      queryType,
      startDate,
      endDate,
      isComparison,
      comparisonQuery,
      comparisonStartDate,
      comparisonEndDate,
    } = await generateSmartGAQL(query, accountInfo.name)

    logger.info(`[${requestId}] Smart-generated query details`, {
      queryType,
      periodType,
      dateRange: `${startDate} to ${endDate}`,
      account: accountInfo.name,
      gaqlQuery: gaqlQuery,
      isComparison,
      comparisonDateRange: isComparison ? `${comparisonStartDate} to ${comparisonEndDate}` : null,
    })

    // Make the API request(s) using the actual account ID and generated query
    const apiResult = await makeGoogleAdsRequest(accountInfo.id, gaqlQuery)
    let comparisonApiResult = null

    // If this is a comparison query, make a second API call for the comparison period
    if (isComparison && comparisonQuery) {
      logger.info(
        `[${requestId}] Making comparison query for period: ${comparisonStartDate} to ${comparisonEndDate}`
      )
      comparisonApiResult = await makeGoogleAdsRequest(accountInfo.id, comparisonQuery)
    }

    // Process primary period results
    const primaryResults = processGoogleAdsResults(apiResult, requestId, 'primary')

    // Process comparison period results if available
    let comparisonResults = null
    if (comparisonApiResult) {
      comparisonResults = processGoogleAdsResults(comparisonApiResult, requestId, 'comparison')
    }

    const accountResult: AccountResult = {
      account_id: accountInfo.id,
      account_name: accountInfo.name,
      campaigns: primaryResults.campaigns,
      total_campaigns: primaryResults.campaigns.length,
      account_totals: {
        clicks: primaryResults.accountTotals.clicks,
        impressions: primaryResults.accountTotals.impressions,
        cost: primaryResults.accountTotals.cost,
        conversions: primaryResults.accountTotals.conversions,
        ctr:
          primaryResults.accountTotals.impressions > 0
            ? Math.round(
                (primaryResults.accountTotals.clicks / primaryResults.accountTotals.impressions) *
                  100 *
                  100
              ) / 100
            : 0,
        avg_cpc:
          primaryResults.accountTotals.clicks > 0
            ? Math.round(
                (primaryResults.accountTotals.cost / primaryResults.accountTotals.clicks) * 100
              ) / 100
            : 0,
        conversion_rate:
          primaryResults.accountTotals.clicks > 0
            ? Math.round(
                (primaryResults.accountTotals.conversions / primaryResults.accountTotals.clicks) *
                  100 *
                  100
              ) / 100
            : 0,
        cost_per_conversion:
          primaryResults.accountTotals.conversions > 0
            ? Math.round(
                (primaryResults.accountTotals.cost / primaryResults.accountTotals.conversions) * 100
              ) / 100
            : 0,
      },
    }

    // Add comparison data to account result if available
    if (comparisonResults) {
      ;(accountResult as any).comparison_campaigns = comparisonResults.campaigns
      ;(accountResult as any).comparison_totals = {
        clicks: comparisonResults.accountTotals.clicks,
        impressions: comparisonResults.accountTotals.impressions,
        cost: comparisonResults.accountTotals.cost,
        conversions: comparisonResults.accountTotals.conversions,
        ctr:
          comparisonResults.accountTotals.impressions > 0
            ? Math.round(
                (comparisonResults.accountTotals.clicks /
                  comparisonResults.accountTotals.impressions) *
                  100 *
                  100
              ) / 100
            : 0,
        avg_cpc:
          comparisonResults.accountTotals.clicks > 0
            ? Math.round(
                (comparisonResults.accountTotals.cost / comparisonResults.accountTotals.clicks) *
                  100
              ) / 100
            : 0,
        conversion_rate:
          comparisonResults.accountTotals.clicks > 0
            ? Math.round(
                (comparisonResults.accountTotals.conversions /
                  comparisonResults.accountTotals.clicks) *
                  100 *
                  100
              ) / 100
            : 0,
        cost_per_conversion:
          comparisonResults.accountTotals.conversions > 0
            ? Math.round(
                (comparisonResults.accountTotals.cost /
                  comparisonResults.accountTotals.conversions) *
                  100
              ) / 100
            : 0,
      }
    }

    const response = {
      query,
      query_type: queryType,
      period_type: periodType,
      date_range: `${startDate} to ${endDate}`,
      is_comparison: isComparison || false,
      comparison_date_range: isComparison ? `${comparisonStartDate} to ${comparisonEndDate}` : null,
      accounts_found: 1,
      grand_totals: {
        clicks: primaryResults.accountTotals.clicks,
        impressions: primaryResults.accountTotals.impressions,
        cost: primaryResults.accountTotals.cost,
        conversions: primaryResults.accountTotals.conversions,
        ctr:
          primaryResults.accountTotals.impressions > 0
            ? Math.round(
                (primaryResults.accountTotals.clicks / primaryResults.accountTotals.impressions) *
                  100 *
                  100
              ) / 100
            : 0,
        avg_cpc:
          primaryResults.accountTotals.clicks > 0
            ? Math.round(
                (primaryResults.accountTotals.cost / primaryResults.accountTotals.clicks) * 100
              ) / 100
            : 0,
        conversion_rate:
          primaryResults.accountTotals.clicks > 0
            ? Math.round(
                (primaryResults.accountTotals.conversions / primaryResults.accountTotals.clicks) *
                  100 *
                  100
              ) / 100
            : 0,
        cost_per_conversion:
          primaryResults.accountTotals.conversions > 0
            ? Math.round(
                (primaryResults.accountTotals.cost / primaryResults.accountTotals.conversions) * 100
              ) / 100
            : 0,
      },
      comparison_totals: comparisonResults
        ? {
            clicks: comparisonResults.accountTotals.clicks,
            impressions: comparisonResults.accountTotals.impressions,
            cost: comparisonResults.accountTotals.cost,
            conversions: comparisonResults.accountTotals.conversions,
            ctr:
              comparisonResults.accountTotals.impressions > 0
                ? Math.round(
                    (comparisonResults.accountTotals.clicks /
                      comparisonResults.accountTotals.impressions) *
                      100 *
                      100
                  ) / 100
                : 0,
            avg_cpc:
              comparisonResults.accountTotals.clicks > 0
                ? Math.round(
                    (comparisonResults.accountTotals.cost /
                      comparisonResults.accountTotals.clicks) *
                      100
                  ) / 100
                : 0,
            conversion_rate:
              comparisonResults.accountTotals.clicks > 0
                ? Math.round(
                    (comparisonResults.accountTotals.conversions /
                      comparisonResults.accountTotals.clicks) *
                      100 *
                      100
                  ) / 100
                : 0,
            cost_per_conversion:
              comparisonResults.accountTotals.conversions > 0
                ? Math.round(
                    (comparisonResults.accountTotals.cost /
                      comparisonResults.accountTotals.conversions) *
                      100
                  ) / 100
                : 0,
          }
        : null,
      results: [accountResult],
      data_availability: {
        overall_status: 'available',
        accounts: [
          {
            account_name: accountInfo.name,
            account_id: accountInfo.id,
            data_available: true,
            latest_data_date: endDate,
            requested_range: `${startDate} to ${endDate}`,
            comparison_range: isComparison
              ? `${comparisonStartDate} to ${comparisonEndDate}`
              : null,
            days_behind: 1,
            message: isComparison
              ? `Data available for both periods: ${startDate} to ${endDate} and ${comparisonStartDate} to ${comparisonEndDate}`
              : `Data available until ${endDate}`,
          },
        ],
        summary: '1/1 accounts have requested data',
      },
    }

    const executionTime = Date.now() - startTime
    logger.info(`[${requestId}] Google Ads query completed successfully`, {
      executionTime,
      accountsFound: 1,
      totalCampaigns: primaryResults.campaigns.length,
      grandTotalCost: response.grand_totals.cost,
      isComparison,
      comparisonCampaigns: comparisonResults?.campaigns.length || 0,
      comparisonTotalCost: comparisonResults?.accountTotals.cost || 0,
    })

    logger.info(`[${requestId}] Returning response`, {
      responseKeys: Object.keys(response),
      resultsLength: response.results.length,
      firstResult: response.results[0]
        ? {
            account_name: response.results[0].account_name,
            campaigns_count: response.results[0].campaigns.length,
          }
        : null,
    })

    return NextResponse.json(response)
  } catch (error) {
    const executionTime = Date.now() - startTime
    logger.error(`[${requestId}] Google Ads query failed`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime,
    })

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: 'Failed to process Google Ads query',
      },
      { status: 500 }
    )
  }
}
