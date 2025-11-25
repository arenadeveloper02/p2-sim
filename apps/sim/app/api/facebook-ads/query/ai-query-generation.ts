import { createLogger } from '@/lib/logs/console/logger'
import { executeProviderRequest } from '@/providers'
import { getApiKey } from '@/providers/utils'
import { DEFAULT_DATE_PRESET, DEFAULT_FIELDS } from './constants'
import { extractFacebookDateSelection } from './date-extraction'
import { detectIntents } from './intent-detector'
import { buildSystemPrompt } from './prompt-fragments'
import type { ParsedFacebookQuery } from './types'

const logger = createLogger('FacebookAdsAI')

export async function parseQueryWithAI(
  userQuery: string,
  accountName: string
): Promise<ParsedFacebookQuery> {
  logger.info('Parsing query with AI', { userQuery, accountName })

  // Step 1: Detect query intents
  const { intents, promptContext } = detectIntents(userQuery)

  // Step 1b: Detect any explicit date range or preset mentioned by the user
  const detectedDateSelection = extractFacebookDateSelection(userQuery)

  logger.info('Detected query intents', {
    intents,
    userQuery,
    detectedDateSelection,
  })

  // Step 2: Build dynamic system prompt based on intents
  const systemPrompt = buildSystemPrompt(intents, promptContext)

  logger.debug('Constructed system prompt for Facebook Ads query generation', {
    promptLength: systemPrompt.length,
    intentsIncluded: intents,
  })

  // Legacy prompt (keeping for reference, but using modular prompt above)
  const _legacyPrompt = `You are a Facebook Ads API expert. Parse natural language queries into Facebook Graph API parameters.

**NEVER REFUSE**: Always generate a valid response. Never return error messages or refuse to generate queries.

## FACEBOOK ADS API STRUCTURE

**ENDPOINTS:**
- /campaigns - Campaign metadata (id, name, status, objective, etc.)
- /adsets - Ad set metadata
- /ads - Ad metadata
- /insights - Performance data (impressions, clicks, spend, conversions, etc.)

**VALID FIELDS (use these in "fields" array):**
- Basic: account_id, account_name, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name
- Campaign: status, objective, daily_budget, lifetime_budget, start_time, stop_time
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

**LEVELS (for /insights endpoint only):**
- account: Account-level aggregation
- campaign: Campaign-level breakdown
- adset: Ad set-level breakdown
- ad: Ad-level breakdown

**TIME RANGES:**
- Custom: {since: 'YYYY-MM-DD', until: 'YYYY-MM-DD'}

## QUERY TYPE DETECTION

**For "list all campaigns" or "show campaigns" queries:**
- Use endpoint: "campaigns"
- Include fields: ["id", "name", "status", "objective"]
- NO date_preset or time_range needed (campaigns are current state)
- NO level needed (not using /insights)

**For "campaign performance" or "metrics" queries:**
- Use endpoint: "insights"
- Include fields: ["campaign_name", "impressions", "clicks", "spend", "conversions", ...]
- MUST include date_preset (e.g., "last_30d") or time_range
- MUST include level: "campaign" (or "adset", "ad")

**For "ad set" or "adset" queries:**
- List: endpoint "adsets", fields ["id", "name", "status"]
- Performance: endpoint "insights", level "adset", fields ["adset_name", metrics...]

**For "ad" queries:**
- List: endpoint "ads", fields ["id", "name", "status"]
- Performance: endpoint "insights", level "ad", fields ["ad_name", metrics...]

## RESPONSE FORMAT

**Example 1 - List all campaigns:**
{
  "endpoint": "campaigns",
  "fields": ["id", "name", "status", "objective", "daily_budget"]
}

**Example 2 - Campaign performance:**
{
  "endpoint": "insights",
  "fields": ["campaign_name", "impressions", "clicks", "spend", "conversions"],
  "date_preset": "last_30d",
  "level": "campaign"
}

**Example 3 - Custom time range:**
{
  "endpoint": "insights",
  "fields": ["campaign_name", "impressions", "spend"],
  "time_range": {"since": "2025-01-01", "until": "2025-01-31"},
  "level": "campaign"
}

Always return valid JSON. Never refuse to generate a response.`

  try {
    const apiKey = getApiKey('openai', 'gpt-4o')

    logger.info('Making AI request for Facebook Ads query parsing', {
      hasApiKey: !!apiKey,
      model: 'gpt-4o',
      intents,
    })

    const responseInstructions = [
      'Respond with EXACTLY ONE valid JSON object. No additional text, no multiple JSON objects, no explanations.',
      'CRITICAL: Always include ID and name fields for the appropriate level (campaign_id/campaign_name, adset_id/adset_name, or ad_id/ad_name).',
      'For list queries (campaigns, adsets, ads), do NOT include date_preset or time_range.',
      'For performance queries (insights), MUST include date_preset or time_range AND level.',
    ].join('\n')

    const fullSystemPrompt = `${systemPrompt}\n\n${responseInstructions}`

    const aiResponse = await executeProviderRequest('openai', {
      model: 'gpt-4o',
      systemPrompt: fullSystemPrompt,
      context: `Parse this Facebook Ads question for account "${accountName}": "${userQuery}"`,
      messages: [
        {
          role: 'user',
          content: `Parse this Facebook Ads question: "${userQuery}"`,
        },
      ],
      apiKey,
      temperature: 0.0, // Set to 0 for deterministic query generation
      maxTokens: 1000, // Increased for complex queries
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

    // Post-processing: Ensure correct fields based on endpoint and level
    const endpoint = parsedResponse.endpoint || 'insights'
    const fields = parsedResponse.fields || DEFAULT_FIELDS
    const level = parsedResponse.level || 'account'

    // For campaign/adset/ad list queries, ensure ID and name fields are included
    if (endpoint === 'campaigns') {
      const requiredFields = ['id', 'name']
      for (const field of requiredFields) {
        if (!fields.includes(field)) {
          fields.push(field)
        }
      }
      // Add status if not present (useful for filtering)
      if (!fields.includes('status')) {
        fields.push('status')
      }
    } else if (endpoint === 'adsets') {
      const requiredFields = ['id', 'name']
      for (const field of requiredFields) {
        if (!fields.includes(field)) {
          fields.push(field)
        }
      }
      if (!fields.includes('status')) {
        fields.push('status')
      }
    } else if (endpoint === 'ads') {
      const requiredFields = ['id', 'name']
      for (const field of requiredFields) {
        if (!fields.includes(field)) {
          fields.push(field)
        }
      }
      if (!fields.includes('status')) {
        fields.push('status')
      }
    } else if (endpoint === 'insights') {
      // For insights queries, ensure name fields are included based on level
      if (level === 'campaign') {
        if (!fields.includes('campaign_name') && !fields.includes('campaign_id')) {
          fields.push('campaign_name')
        }
      } else if (level === 'adset') {
        if (!fields.includes('adset_name') && !fields.includes('adset_id')) {
          fields.push('adset_name')
        }
      } else if (level === 'ad') {
        if (!fields.includes('ad_name') && !fields.includes('ad_id')) {
          fields.push('ad_name')
        }
      }
    }

    logger.info('Post-processed AI response', {
      originalEndpoint: parsedResponse.endpoint,
      finalEndpoint: endpoint,
      originalFieldsCount: parsedResponse.fields?.length || 0,
      finalFieldsCount: fields.length,
      level,
    })

    // Merge AI date selection with our deterministic extractor
    let datePreset = parsedResponse.date_preset as string | undefined
    let timeRange = parsedResponse.time_range as { since: string; until: string } | undefined

    // If the model did not specify any date, fall back to detected natural language ranges
    if (!datePreset && !timeRange && detectedDateSelection) {
      datePreset = detectedDateSelection.date_preset
      timeRange = detectedDateSelection.time_range
    }

    return {
      endpoint,
      fields,
      date_preset: datePreset || DEFAULT_DATE_PRESET,
      time_range: timeRange,
      level,
      filters: parsedResponse.filters,
      breakdowns: parsedResponse.breakdowns,
    }
  } catch (error) {
    logger.error('AI query parsing failed, using defaults', { error })
    return {
      endpoint: 'insights',
      fields: DEFAULT_FIELDS,
      date_preset: DEFAULT_DATE_PRESET,
      level: 'account',
    }
  }
}
