import { createLogger } from '@/lib/logs/console/logger'
import { executeProviderRequest } from '@/providers'
import { getApiKey } from '@/providers/utils'
import { DEFAULT_DATE_PRESET, DEFAULT_FIELDS } from './constants'
import type { ParsedFacebookQuery } from './types'

const logger = createLogger('FacebookAdsAI')

export async function parseQueryWithAI(
  userQuery: string,
  accountName: string
): Promise<ParsedFacebookQuery> {
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
      fields: parsedResponse.fields || DEFAULT_FIELDS,
      date_preset: parsedResponse.date_preset || DEFAULT_DATE_PRESET,
      time_range: parsedResponse.time_range,
      level: parsedResponse.level || 'account',
      filters: parsedResponse.filters,
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
