import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { executeProviderRequest } from '@/providers'
import { getApiKey } from '@/providers/utils'

const logger = createLogger('GoogleAdsAPI')

// Google Ads accounts configuration - matching Python script
const GOOGLE_ADS_ACCOUNTS: Record<string, { id: string; name: string }> = {
  ami: { id: '7284380454', name: 'AMI' },
  heartland: { id: '4479015711', name: 'Heartland' },
  nhi: { id: '2998186794', name: 'NHI' },
  oic_culpeper: { id: '8226685899', name: 'OIC-Culpeper' },
  odc_al: { id: '1749359003', name: 'ODC-AL' },
  cpic: { id: '1757492986', name: 'CPIC' },
  idi_fl: { id: '1890773395', name: 'IDI-FL' },
  smi: { id: '9960845284', name: 'SMI' },
  holmdel_nj: { id: '3507263995', name: 'Holmdel-NJ' },
  ft_jesse: { id: '4443836419', name: 'Ft. Jesse' },
  ud: { id: '8270553905', name: 'UD' },
  wolf_river: { id: '6445143850', name: 'Wolf River' },
  phoenix_rehab: { id: '4723354550', name: 'Phoenix Rehab (NEW - WM Invoices)' },
  au_eventgroove_products: { id: '3365918329', name: 'AU - Eventgroove Products' },
  us_eventgroove_products: { id: '4687328820', name: 'US - Eventgroove Products' },
  ca_eventgroove_products: { id: '5197514377', name: 'CA - Eventgroove Products' },
  perforated_paper: { id: '8909188371', name: 'Perforated Paper' },
  uk_eventgroove_products: { id: '7662673578', name: 'UK - Eventgroove Products' },
  monster_transmission: { id: '2680354698', name: 'Monster Transmission' },
  careadvantage: { id: '9059182052', name: 'CareAdvantage' },
  capitalcitynurses: { id: '8395621144', name: 'CapitalCityNurses.com' },
  silverlininghealthcare: { id: '4042307092', name: 'Silverlininghealthcare.com' },
  youngshc: { id: '3240333229', name: 'Youngshc.com' },
  nova_hhc: { id: '9279793056', name: 'Nova HHC' },
  inspire_aesthetics: { id: '1887900641', name: 'Inspire Aesthetics' },
  mosca_plastic_surgery: { id: '8687457378', name: 'Mosca Plastic Surgery' },
  marietta_plastic_surgery: { id: '6374556990', name: 'Marietta Plastic Surgery' },
  daniel_shapiro: { id: '7395576762', name: 'Daniel I. Shapiro, M.D., P.C.' },
  southern_coastal: { id: '2048733325', name: 'Southern Coastal' },
  plastic_surgery_center_hr: { id: '1105892184', name: 'Plastic Surgery Center of Hampton Roads' },
  epstein: { id: '1300586568', name: 'EPSTEIN' },
  covalent_metrology: { id: '3548685960', name: 'Covalent Metrology' },
  gentle_dental: { id: '2497090182', name: 'Gentle Dental' },
  great_hill_dental: { id: '6480839212', name: 'Great Hill Dental' },
  dynamic_dental: { id: '4734954125', name: 'Dynamic Dental' },
  great_lakes: { id: '9925296449', name: 'Great Lakes' },
  southern_ct_dental: { id: '7842729643', name: 'Southern Connecticut Dental Group' },
  dental_care_associates: { id: '2771541197', name: 'Dental Care Associates' },
  service_air_eastern_shore: { id: '8139983849', name: 'Service Air Eastern Shore' },
  chancey_reynolds: { id: '7098393346', name: 'Chancey & Reynolds' },
  howell_chase: { id: '1890712343', name: 'Howell Chase' },
}

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
    })

    return {
      gaqlQuery: aiResult.gaqlQuery,
      queryType: aiResult.queryType,
      periodType: aiResult.periodType,
      startDate: aiResult.startDate,
      endDate: aiResult.endDate,
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

EXAMPLE QUERIES:
- Campaign impressions: "SELECT campaign.name, metrics.impressions FROM campaign WHERE segments.date BETWEEN '2025-01-01' AND '2025-01-31'  ORDER BY metrics.impressions DESC"
- Campaign clicks: "SELECT campaign.name, metrics.clicks FROM campaign WHERE segments.date BETWEEN '2024-09-01' AND '2024-09-17'  ORDER BY metrics.clicks DESC"
- Keyword performance: "SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, metrics.clicks FROM keyword_view WHERE segments.date BETWEEN '2024-09-01' AND '2024-09-17' ORDER BY metrics.clicks DESC"

TIME PERIOD CALCULATIONS (based on current date ${todayStr}):
- "January 2025" = '2025-01-01' to '2025-01-31'
- "today" = '${todayStr}' to '${todayStr}'
- "yesterday" = previous day to previous day
- "last 7 days" = 7 days ago to yesterday  
- "last 30 days" = 30 days ago to yesterday
- "this month" = first day of current month to today
- "last month" = first day to last day of previous month

IMPORTANT: You must ALWAYS return valid JSON with a GAQL query. Never return error messages or refuse to generate a query.

Return JSON format:
{
  "gaql_query": "SELECT campaign.name, metrics.impressions FROM campaign WHERE segments.date BETWEEN '2025-01-01' AND '2025-01-31' ORDER BY metrics.impressions DESC",
  "query_type": "campaigns",
  "period_type": "custom_january_2025", 
  "start_date": "2025-01-01",
  "end_date": "2025-01-31"
}`

  try {
    // Get API key for OpenAI hosted provider
    let apiKey: string
    try {
      apiKey = getApiKey('openai', 'gpt-4o')
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
      systemPrompt: `${systemPrompt}\n\nRespond ONLY with valid JSON. No additional text.`,
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

    // Parse AI response
    const hasStructuredOutput = aiContent.replace(/```json\n?|\n?```/g, '')
    let parsedResponse

    try {
      parsedResponse = JSON.parse(hasStructuredOutput)
    } catch (parseError) {
      logger.error('Failed to parse AI JSON response', {
        aiContent,
        hasStructuredOutput,
        parseError,
      })
      throw new Error(`AI returned invalid JSON: ${hasStructuredOutput}`)
    }

    // Validate required fields - check for multiple possible formats
    let gaqlQuery = parsedResponse.gaql_query || parsedResponse.query

    // Handle queries array format
    if (
      !gaqlQuery &&
      parsedResponse.queries &&
      Array.isArray(parsedResponse.queries) &&
      parsedResponse.queries.length > 0
    ) {
      // Use the first query from the array
      gaqlQuery = parsedResponse.queries[0].query || parsedResponse.queries[0].gaql_query
      logger.info('Using first query from queries array', {
        totalQueries: parsedResponse.queries.length,
        selectedQuery: gaqlQuery,
      })
    }

    if (!gaqlQuery) {
      logger.error('AI response missing GAQL query field', { parsedResponse })
      throw new Error(`AI response missing GAQL query: ${JSON.stringify(parsedResponse)}`)
    }

    // Clean and validate the AI-generated GAQL query
    let cleanedGaqlQuery = gaqlQuery || ''

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
    })

    return adsData
  } catch (error) {
    logger.error('Error in Google Ads API request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      accountId,
    })
    throw error
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

    // Use smart parsing to generate GAQL query based on the user's question
    const { gaqlQuery, periodType, queryType, startDate, endDate } = await generateSmartGAQL(
      query,
      accountInfo.name
    )

    logger.info(`[${requestId}] Smart-generated query details`, {
      queryType,
      periodType,
      dateRange: `${startDate} to ${endDate}`,
      account: accountInfo.name,
      gaqlQuery: gaqlQuery,
    })

    // Make the API request using the actual account ID and generated query
    const apiResult = await makeGoogleAdsRequest(accountInfo.id, gaqlQuery)

    // Process results similar to Python script
    const campaigns: Campaign[] = []
    let accountClicks = 0
    let accountImpressions = 0
    let accountCost = 0
    let accountConversions = 0

    if (apiResult.results) {
      for (const result of apiResult.results) {
        const campaignData = result.campaign
        const metricsData = result.metrics

        const clicks = Number.parseInt(metricsData.clicks || '0')
        const impressions = Number.parseInt(metricsData.impressions || '0')
        const costMicros = Number.parseInt(metricsData.costMicros || '0')
        const conversions = Number.parseFloat(metricsData.conversions || '0')
        const conversionsValue = Number.parseFloat(metricsData.conversionsValue || '0')
        const avgCpcMicros = Number.parseInt(metricsData.averageCpc || '0')
        const costPerConversionMicros = Number.parseInt(metricsData.costPerConversion || '0')
        const impressionShare = Number.parseFloat(metricsData.searchImpressionShare || '0')
        const budgetLostShare = Number.parseFloat(
          metricsData.searchBudgetLostImpressionShare || '0'
        )
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
            costMicros > 0
              ? Math.round((conversionsValue / (costMicros / 1000000)) * 100) / 100
              : 0,
        }
        campaigns.push(campaignInfo)
      }
    }

    const accountResult: AccountResult = {
      account_id: accountInfo.id,
      account_name: accountInfo.name,
      campaigns,
      total_campaigns: campaigns.length,
      account_totals: {
        clicks: accountClicks,
        impressions: accountImpressions,
        cost: Math.round((accountCost / 1000000) * 100) / 100,
        conversions: accountConversions,
        ctr:
          accountImpressions > 0
            ? Math.round((accountClicks / accountImpressions) * 100 * 100) / 100
            : 0,
        avg_cpc:
          accountClicks > 0 ? Math.round((accountCost / 1000000 / accountClicks) * 100) / 100 : 0,
        conversion_rate:
          accountClicks > 0
            ? Math.round((accountConversions / accountClicks) * 100 * 100) / 100
            : 0,
        cost_per_conversion:
          accountConversions > 0
            ? Math.round((accountCost / 1000000 / accountConversions) * 100) / 100
            : 0,
      },
    }

    const response = {
      query,
      query_type: queryType,
      period_type: periodType,
      date_range: `${startDate} to ${endDate}`,
      accounts_found: 1,
      grand_totals: {
        clicks: accountClicks,
        impressions: accountImpressions,
        cost: Math.round((accountCost / 1000000) * 100) / 100,
        conversions: accountConversions,
        ctr:
          accountImpressions > 0
            ? Math.round((accountClicks / accountImpressions) * 100 * 100) / 100
            : 0,
        avg_cpc:
          accountClicks > 0 ? Math.round((accountCost / 1000000 / accountClicks) * 100) / 100 : 0,
        conversion_rate:
          accountClicks > 0
            ? Math.round((accountConversions / accountClicks) * 100 * 100) / 100
            : 0,
        cost_per_conversion:
          accountConversions > 0
            ? Math.round((accountCost / 1000000 / accountConversions) * 100) / 100
            : 0,
      },
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
            days_behind: 1,
            message: `Data available until ${endDate}`,
          },
        ],
        summary: '1/1 accounts have requested data',
      },
    }

    const executionTime = Date.now() - startTime
    logger.info(`[${requestId}] Google Ads query completed successfully`, {
      executionTime,
      accountsFound: 1,
      totalCampaigns: campaigns.length,
      grandTotalCost: response.grand_totals.cost,
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
