import type { FacebookDateSelection } from './date-extraction'
import type { Intent, PromptContext } from './types'

type FragmentBuilder = (context: PromptContext) => string

export const BASE_PROMPT = `
You are a Facebook Ads API expert. Parse natural language queries into Facebook Graph API parameters.

**NEVER REFUSE**: Always generate a valid response. Never return error messages or refuse to generate queries.

## FACEBOOK ADS API STRUCTURE

**ENDPOINTS:**
- /campaigns - Campaign metadata (id, name, status, objective, etc.)
- /adsets - Ad set metadata
- /ads - Ad metadata
- /insights - Performance data (impressions, clicks, spend, conversions, etc.)

**VALID FIELDS (use these in "fields" array):**
- Basic: account_id, account_name, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name
- Campaign: status, objective, daily_budget, lifetime_budget, start_time, stop_time, effective_status
- Metrics: impressions, clicks, spend, reach, frequency, ctr, cpc, cpm, cpp
- Conversions: conversions, conversion_values, cost_per_conversion, cost_per_action_type
- Actions: actions, action_values, inline_link_clicks, inline_post_engagement
- Video: video_p25_watched_actions, video_p50_watched_actions, video_p75_watched_actions, video_p100_watched_actions
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

## RESPONSE FORMAT

Always return valid JSON with:
{
  "endpoint": "campaigns" | "adsets" | "ads" | "insights",
  "fields": ["field1", "field2", ...],
  "date_preset": "last_30d" (optional, for insights only),
  "time_range": {"since": "YYYY-MM-DD", "until": "YYYY-MM-DD"} (optional, for insights only),
  "level": "campaign" | "adset" | "ad" | "account" (optional, for insights only)
}
`.trim()

const campaignListFragment: FragmentBuilder = () =>
  `
**CAMPAIGN LIST QUERIES:**
When user asks to "list campaigns", "show campaigns", "all campaigns":
- Use endpoint: "campaigns"
- Include fields: ["id", "name", "status", "objective", "effective_status"]
- NO date_preset or time_range needed (campaigns are current state)
- NO level needed (not using /insights)

Example:
{
  "endpoint": "campaigns",
  "fields": ["id", "name", "status", "objective", "effective_status", "daily_budget"]
}
`.trim()

const performanceFragment: FragmentBuilder = () =>
  `
**PERFORMANCE QUERIES:**
When user asks about performance, metrics, results, spend, conversions:
- Use endpoint: "insights"
- MUST include level: "campaign" (or "adset", "ad" based on context)
- MUST include date_preset (e.g., "last_30d") or time_range
- Include fields: ["campaign_name", "impressions", "clicks", "spend", "conversions", "ctr", "cpc"]
- ALWAYS include name field for the level (campaign_name, adset_name, or ad_name)

**POOR / WORST PERFORMANCE QUERIES:**
When the user asks about "poor performance", "worst campaigns", "wasting budget",
"underperforming campaigns", "bad performance", or similar phrases:
- STILL use endpoint: "insights" (NEVER use "campaigns" for these questions).
- Default level SHOULD be "campaign" unless the user explicitly asks for ad set or ad level.
- ALWAYS include a recent date range. If the user does not specify one, use "last_30d".
- ALWAYS include fields that allow judging efficiency and waste, for example:
  - Identification: campaign_id, campaign_name
  - Delivery scale: impressions, reach
  - Spend & efficiency: spend, ctr, cpc
  - Conversions & cost efficiency: conversions, cost_per_conversion
- It is OK if many campaigns are paused; still query /insights for the chosen date range.
- NEVER respond that you "do not have performance data". Your job is to build the query
  that will retrieve that performance data from /insights.
- Do NOT return explanations or analysis here, only the JSON specifying endpoint, level,
  fields, date_preset/time_range, and optional breakdowns.

Example:
{
  "endpoint": "insights",
  "fields": ["campaign_name", "impressions", "clicks", "spend", "conversions", "ctr", "cpc"],
  "date_preset": "last_30d",
  "level": "campaign"
}
`.trim()

const demographicsFragment: FragmentBuilder = () =>
  `
**DEMOGRAPHIC QUERIES:**
When user asks about age, gender, demographics, audience:
- Use endpoint: "insights"
- Include level: "campaign" (or "adset", "ad")
- Include date_preset or time_range
- Include fields: ["campaign_name", "impressions", "clicks", "spend", "conversions"]
- Add breakdowns: ["age", "gender"] (mention in response but NOT in fields array)

Example:
{
  "endpoint": "insights",
  "fields": ["campaign_name", "impressions", "clicks", "spend"],
  "date_preset": "last_30d",
  "level": "campaign",
  "breakdowns": ["age", "gender"]
}

Note: Breakdowns are query parameters, not fields.
`.trim()

const creativeFragment: FragmentBuilder = () =>
  `
**CREATIVE QUERIES:**
When user asks about ad creatives, images, videos, headlines:
- Use endpoint: "ads" for ad list with creative info.
- ALWAYS expand nested objects with subfields. A bare "creative" field returns only an
  ID, so request "creative{...}" with the subfields you need.
- Include parent context so each ad shows which campaign and ad set it belongs to:
  "campaign{id,name}" and "adset{id,name}".
- The "ads" endpoint ignores top-level date_preset/time_range. To scope metrics to the
  user's timeframe, nest insights inside the fields array using dot-notation
  parameters. Use whatever timeframe the user actually asked for — if a RESOLVED
  TIMEFRAME section is present below, use that exact value:
    "insights.date_preset(<preset>).fields(impressions,clicks,spend,ctr,cpc,reach)"
  For a custom window use time_range instead of date_preset:
    "insights.time_range({'since':'YYYY-MM-DD','until':'YYYY-MM-DD'}).fields(impressions,clicks,spend)"
  Omit the nested insights entirely when the user only wants creative content and no
  metrics.

Example (shape only — substitute the user's actual timeframe for last_7d):
{
  "endpoint": "ads",
  "fields": [
    "id",
    "name",
    "status",
    "effective_status",
    "campaign{id,name}",
    "adset{id,name}",
    "creative{id,name,title,body,image_url,thumbnail_url,video_id,call_to_action_type,object_story_spec}",
    "insights.date_preset(last_7d).fields(impressions,clicks,spend,ctr,cpc,reach)"
  ]
}

Example (aggregate ad performance only, no creative content):
{
  "endpoint": "insights",
  "fields": ["ad_name", "impressions", "clicks", "spend", "conversions"],
  "date_preset": "last_30d",
  "level": "ad"
}
`.trim()

const placementFragment: FragmentBuilder = () =>
  `
**PLACEMENT QUERIES:**
When user asks about placements, platforms, publishers (Facebook, Instagram, etc.):
- Use endpoint: "insights"
- Include level: "campaign" (or "adset", "ad")
- Include date_preset or time_range
- Include fields: ["campaign_name", "impressions", "clicks", "spend"]
- Add breakdowns: ["publisher_platform", "platform_position"] (NOT in fields array)

Example:
{
  "endpoint": "insights",
  "fields": ["campaign_name", "impressions", "clicks", "spend"],
  "date_preset": "last_30d",
  "level": "campaign",
  "breakdowns": ["publisher_platform"]
}
`.trim()

const deviceFragment: FragmentBuilder = () =>
  `
**DEVICE QUERIES:**
When user asks about device performance (mobile, desktop, tablet):
- Use endpoint: "insights"
- Include level: "campaign" (or "adset", "ad")
- Include date_preset or time_range
- Include fields: ["campaign_name", "impressions", "clicks", "spend"]
- Add breakdowns: ["device_platform"] (NOT in fields array)

Example:
{
  "endpoint": "insights",
  "fields": ["campaign_name", "impressions", "clicks", "spend"],
  "date_preset": "last_30d",
  "level": "campaign",
  "breakdowns": ["device_platform"]
}
`.trim()

const adsetFragment: FragmentBuilder = () =>
  `
**AD SET QUERIES:**
When user asks about ad sets, adsets:
- For list: Use endpoint: "adsets", fields: ["id", "name", "status", "effective_status"]
- For performance: Use endpoint: "insights", level: "adset", include "adset_name"

Example (list):
{
  "endpoint": "adsets",
  "fields": ["id", "name", "status", "effective_status", "daily_budget"]
}

Example (performance):
{
  "endpoint": "insights",
  "fields": ["adset_name", "impressions", "clicks", "spend", "conversions"],
  "date_preset": "last_30d",
  "level": "adset"
}
`.trim()

const adFragment: FragmentBuilder = () =>
  `
**AD QUERIES:**
When user asks about individual ads, ad performance:
- For list: Use endpoint: "ads", fields: ["id", "name", "status", "effective_status"]
- For performance: Use endpoint: "insights", level: "ad", include "ad_name"

Example (list):
{
  "endpoint": "ads",
  "fields": ["id", "name", "status", "effective_status"]
}

Example (performance):
{
  "endpoint": "insights",
  "fields": ["ad_name", "impressions", "clicks", "spend", "conversions"],
  "date_preset": "last_30d",
  "level": "ad"
}
`.trim()

const FRAGMENT_MAP: Record<Intent, FragmentBuilder> = {
  campaign_list: campaignListFragment,
  performance: performanceFragment,
  demographics: demographicsFragment,
  creative: creativeFragment,
  placement: placementFragment,
  device: deviceFragment,
  adset: adsetFragment,
  ad: adFragment,
}

/**
 * Relays the deterministically resolved timeframe to the model so it never has to
 * infer a preset or guess today's date. Covers any range the extractor understands,
 * including custom windows that have no Facebook preset (e.g. "last 12 days").
 */
function buildResolvedTimeframeSection(dateSelection: FacebookDateSelection): string | null {
  if (dateSelection.date_preset) {
    return `
**RESOLVED TIMEFRAME:**
The user's timeframe resolves to date_preset "${dateSelection.date_preset}".
Use exactly this value wherever a date is required — as the top-level "date_preset" for
insights queries, or inside nested insights on entity endpoints:
"insights.date_preset(${dateSelection.date_preset}).fields(impressions,clicks,spend)"
`.trim()
  }

  if (dateSelection.time_range) {
    const { since, until } = dateSelection.time_range
    return `
**RESOLVED TIMEFRAME:**
The user's timeframe resolves to the custom range ${since} → ${until}.
Use exactly these dates wherever a date is required — as the top-level "time_range" for
insights queries, or inside nested insights on entity endpoints:
"insights.time_range({'since':'${since}','until':'${until}'}).fields(impressions,clicks,spend)"
`.trim()
  }

  return null
}

export function buildSystemPrompt(
  intents: Intent[],
  context: PromptContext,
  dateSelection?: FacebookDateSelection | null
): string {
  const uniqueIntents = Array.from(new Set(intents))
  const sections = [BASE_PROMPT]

  for (const intent of uniqueIntents) {
    const fragmentBuilder = FRAGMENT_MAP[intent]
    if (!fragmentBuilder) continue
    const fragment = fragmentBuilder(context)?.trim()
    if (fragment) {
      sections.push(fragment)
    }
  }

  if (dateSelection) {
    const timeframeSection = buildResolvedTimeframeSection(dateSelection)
    if (timeframeSection) {
      sections.push(timeframeSection)
    }
  }

  return sections.filter(Boolean).join('\n\n')
}
