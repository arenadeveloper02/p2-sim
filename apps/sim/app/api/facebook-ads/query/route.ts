import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { executeProviderRequest } from '@/providers'
import { getApiKey } from '@/providers/utils'
import { getFacebookAccountId, getFacebookAccountName } from '@/lib/facebook-accounts'

const logger = createLogger('FacebookAdsAPI')

const FB_GRAPH_URL = 'https://graph.facebook.com/v22.0'

interface FacebookAdsRequest {
  query: string
  account: string
  date_preset?: string
  time_range?: { since: string; until: string }
  fields?: string[]
  level?: string
}

interface FacebookAdsResponse {
  success: boolean
  data?: any
  error?: string
  requestId: string
  account_id: string
  account_name: string
  query: string
  timestamp: string
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const timestamp = new Date().toISOString()

  logger.info('Facebook Ads API request received', { requestId })

  try {
    const body: FacebookAdsRequest = await request.json()
    const { query, account, date_preset = 'last_30d', time_range, fields, level = 'account' } = body

    if (!query || !account) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: query and account',
          requestId,
          timestamp,
        },
        { status: 400 }
      )
    }

    logger.info('Processing Facebook Ads query', {
      requestId,
      account,
      query,
      date_preset,
      level,
    })

    // Get account ID
    const accountId = getFacebookAccountId(account as any)
    const accountName = getFacebookAccountName(account as any)

    logger.info('Account details', { accountId, accountName })

    // Parse natural language query with AI
    const parsedQuery = await parseQueryWithAI(query, accountName)

    logger.info('AI parsed query', { parsedQuery })

    // Make Facebook Graph API request
    const result = await makeFacebookAdsRequest(
      accountId,
      parsedQuery.endpoint,
      parsedQuery.fields,
      parsedQuery.date_preset || date_preset,
      parsedQuery.time_range || time_range,
      parsedQuery.level || level,
      parsedQuery.filters
    )

    const response: FacebookAdsResponse = {
      success: true,
      data: result,
      requestId,
      account_id: accountId,
      account_name: accountName,
      query: query,
      timestamp,
    }

    logger.info('Facebook Ads API request successful', {
      requestId,
      resultsCount: result.data?.length || 0,
    })

    return NextResponse.json(response)
  } catch (error) {
    logger.error('Facebook Ads API request failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        requestId,
        timestamp,
      },
      { status: 500 }
    )
  }
}

async function parseQueryWithAI(
  userQuery: string,
  accountName: string
): Promise<{
  endpoint: string
  fields: string[]
  date_preset?: string
  time_range?: { since: string; until: string }
  level?: string
  filters?: any
}> {
  logger.info('Parsing query with AI', { userQuery, accountName })

  const systemPrompt = `You are a Facebook Ads API expert. Parse natural language queries into Facebook Graph API parameters.

## FACEBOOK ADS API STRUCTURE

**ENDPOINTS:**
- /insights - Account, campaign, ad set, or ad performance data
- /campaigns - Campaign information
- /adsets - Ad set information
- /ads - Ad information

**VALID FIELDS (use these in "fields" array):**
- Basic: account_id, account_name, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name
- Metrics: impressions, clicks, spend, reach, frequency, ctr, cpc, cpm, cpp
- Conversions: conversions, conversion_values, cost_per_conversion, cost_per_action_type
- Actions: actions, action_values, inline_link_clicks, inline_post_engagement
- Video: video_p25_watched_actions, video_p50_watched_actions, video_p75_watched_actions
- Quality: quality_ranking, engagement_rate_ranking, conversion_rate_ranking
- Attribution: attribution_setting, action_attribution_windows

**IMPORTANT:** device_platform, age, gender, country, publisher_platform are BREAKDOWNS, not fields. Never include them in the "fields" array.

**DATE PRESETS:**
- today, yesterday, this_month, last_month, this_quarter, last_quarter
- last_3d, last_7d, last_14d, last_28d, last_30d, last_90d
- last_week_mon_sun, last_week_sun_sat, this_week_mon_today, this_week_sun_today
- this_year, last_year, maximum

**LEVELS:**
- account: Account-level aggregation
- campaign: Campaign-level breakdown
- adset: Ad set-level breakdown
- ad: Ad-level breakdown

**TIME RANGES:**
- Custom: {since: 'YYYY-MM-DD', until: 'YYYY-MM-DD'}

## RESPONSE FORMAT

Return ONLY a JSON object with:
{
  "endpoint": "insights",
  "fields": ["campaign_name", "impressions", "clicks", "spend", "conversions"],
  "date_preset": "last_30d",
  "level": "campaign"
}

Or with custom time range:
{
  "endpoint": "insights",
  "fields": ["impressions", "spend"],
  "time_range": {"since": "2025-01-01", "until": "2025-01-31"},
  "level": "account"
}

## EXAMPLES

Query: "Show me campaign performance for last 30 days"
Response: {"endpoint": "insights", "fields": ["campaign_name", "impressions", "clicks", "spend", "ctr", "cpc", "conversions"], "date_preset": "last_30d", "level": "campaign"}

Query: "What are my top performing ad sets?"
Response: {"endpoint": "insights", "fields": ["adset_name", "impressions", "clicks", "spend", "conversions", "roas"], "date_preset": "last_30d", "level": "adset"}

Query: "Get account metrics for last 7 days"
Response: {"endpoint": "insights", "fields": ["impressions", "clicks", "spend", "ctr", "cpc", "conversions"], "date_preset": "last_7d", "level": "account"}

Query: "Show me all campaigns"
Response: {"endpoint": "campaigns", "fields": ["name", "objective", "status", "daily_budget"], "level": "campaign"}

Always return valid JSON. Never refuse to generate a response.`

  try {
    const apiKey = getApiKey('openai', 'gpt-4o')

    const aiResponse = await executeProviderRequest('openai', {
      model: 'gpt-4o',
      systemPrompt: `${systemPrompt}\n\nRespond with EXACTLY ONE valid JSON object. No additional text.`,
      context: `Parse this Facebook Ads question for account "${accountName}": "${userQuery}"`,
      messages: [
        {
          role: 'user',
          content: `Parse this Facebook Ads question: "${userQuery}"`,
        },
      ],
      apiKey,
      temperature: 0.1,
      maxTokens: 300,
    })

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

    const cleanedContent = aiContent.replace(/```json\n?|\n?```/g, '').trim()
    const parsedResponse = JSON.parse(cleanedContent)

    return {
      endpoint: parsedResponse.endpoint || 'insights',
      fields: parsedResponse.fields || [
        'impressions',
        'clicks',
        'spend',
        'ctr',
        'cpc',
        'conversions',
      ],
      date_preset: parsedResponse.date_preset,
      time_range: parsedResponse.time_range,
      level: parsedResponse.level || 'account',
      filters: parsedResponse.filters,
    }
  } catch (error) {
    logger.error('AI query parsing failed, using defaults', { error })
    // Return default insights query
    return {
      endpoint: 'insights',
      fields: ['impressions', 'clicks', 'spend', 'ctr', 'cpc', 'conversions'],
      date_preset: 'last_30d',
      level: 'account',
    }
  }
}

async function makeFacebookAdsRequest(
  accountId: string,
  endpoint: string,
  fields: string[],
  date_preset: string,
  time_range?: { since: string; until: string },
  level?: string,
  filters?: any
): Promise<any> {
  logger.info('Making Facebook Graph API request', {
    accountId,
    endpoint,
    fields,
    date_preset,
    level,
  })

  try {
    const accessToken = process.env.FB_ACCESS_TOKEN

    if (!accessToken) {
      throw new Error('Missing Facebook access token. Please set FB_ACCESS_TOKEN environment variable.')
    }

    // Build API URL
    let apiUrl = `${FB_GRAPH_URL}/${accountId}/${endpoint}`

    // Build query parameters
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: fields.join(','),
    })

    if (endpoint === 'insights') {
      if (time_range) {
        params.append('time_range', JSON.stringify(time_range))
      } else {
        params.append('date_preset', date_preset)
      }

      if (level) {
        params.append('level', level)
      }

      // Add default settings for better data (matching Python MCP)
      params.append('time_increment', 'all_days')
      params.append('use_unified_attribution_setting', 'true')
      params.append('use_account_attribution_setting', 'false')
    }

    if (filters) {
      params.append('filtering', JSON.stringify(filters))
    }

    const fullUrl = `${apiUrl}?${params.toString()}`

    logger.info('Facebook API request', { url: apiUrl, paramsCount: params.toString().length })

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Facebook API request failed', {
        status: response.status,
        error: errorText,
      })
      throw new Error(`Facebook API request failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    logger.info('Facebook API request successful', {
      resultsCount: data.data?.length || 0,
      hasData: !!data.data,
      hasPaging: !!data.paging,
    })

    return data
  } catch (error) {
    logger.error('Error in Facebook API request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      accountId,
    })
    throw error
  }
}
