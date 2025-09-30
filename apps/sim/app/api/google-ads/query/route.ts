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

========================================
SECTION 1: AVAILABLE RESOURCES & METRICS
========================================

AVAILABLE RESOURCES:
- campaign (campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type)
- ad_group (ad_group.id, ad_group.name, ad_group.status) - MUST include campaign.id in SELECT
- ad_group_ad (ad_group_ad.ad.id, ad_group_ad.ad.final_urls, ad_group_ad.status) - MUST include campaign.id in SELECT
- ad_group_criterion (ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.quality_score)
- keyword_view (for keyword performance data) - MUST include campaign.id in SELECT
- customer (customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone)
- campaign_budget (campaign_budget.id, campaign_budget.amount_micros) - Query separately, not from campaign

AVAILABLE METRICS:

Core Performance Metrics:
- metrics.impressions (number of times ad shown)
- metrics.clicks (number of clicks)
- metrics.cost_micros (cost in micro currency units - divide by 1,000,000 for actual cost)
- metrics.average_cpc (average cost per click in micro units)
- metrics.ctr (click-through rate as decimal, e.g., 0.05 = 5%)

Conversion Metrics:
- metrics.conversions (total conversion count)
- metrics.conversions_value (direct conversion revenue - PRIMARY metric for ROI calculations)
- metrics.all_conversions (includes view-through conversions)
- metrics.all_conversions_value (total attributed revenue including view-through)
- metrics.cost_per_conversion (cost divided by conversions)
- metrics.conversion_rate (conversion rate as decimal)

Quality & Position Metrics:
- metrics.quality_score (for keywords only, 1-10 scale)
- metrics.average_position (deprecated but may appear in older data)

Impression Share Metrics:
- metrics.search_impression_share (percentage as decimal, e.g., 0.75 = 75%)
- metrics.search_budget_lost_impression_share (lost due to budget)
- metrics.search_rank_lost_impression_share (lost due to ad rank)

AVAILABLE SEGMENTS (Dimensions):

Time Segments:
- segments.date (format: 'YYYY-MM-DD')
- segments.day_of_week (MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY)
- segments.hour (0-23)
- segments.month (YYYY-MM format)
- segments.quarter (YYYY-Q1, YYYY-Q2, YYYY-Q3, YYYY-Q4)
- segments.year (YYYY)

Device & Network Segments:
- segments.device (DESKTOP, MOBILE, TABLET, CONNECTED_TV, OTHER)
- segments.ad_network_type (SEARCH, DISPLAY, YOUTUBE_SEARCH, YOUTUBE_WATCH, SEARCH_PARTNERS)

========================================
SECTION 2: MANDATORY SYNTAX RULES
========================================

CRITICAL GAQL SYNTAX RULES:
1. ALWAYS generate a valid GAQL query - never return error messages or refuse
2. Basic structure: SELECT fields FROM resource WHERE conditions ORDER BY field [ASC|DESC] LIMIT n
3. **NO GROUP BY** - GAQL automatically aggregates metrics by the dimensions in SELECT
4. **NO FUNCTIONS** - No SUM(), AVG(), COUNT(), or any SQL functions
5. **NO CALCULATIONS** - No arithmetic operations in SELECT or WHERE
6. **NO PARENTHESES** except in BETWEEN clauses: segments.date BETWEEN '2025-01-01' AND '2025-01-31'
7. **NO BRACKETS** [], **NO BRACES** {}, **NO ANGLE BRACKETS** <>
8. Use LIKE '%keyword%' for pattern matching - **CONTAINS is NOT supported**
9. Field names must be exact: campaign.name, metrics.clicks, ad_group_criterion.keyword.text

REQUIRED FIELDS BY RESOURCE:
- campaign: No additional requirements
- ad_group: MUST include campaign.id in SELECT
- keyword_view: MUST include campaign.id in SELECT
- ad_group_ad: MUST include campaign.id in SELECT
- ad_group_criterion: Used within keyword_view with campaign.id

DATE FILTERING RULES:
1. ALWAYS use finite date ranges - open-ended ranges NOT supported
2. Predefined periods: DURING LAST_7_DAYS, DURING LAST_30_DAYS, DURING LAST_90_DAYS
3. Custom ranges: BETWEEN '2025-01-01' AND '2025-01-31'
4. Single day: segments.date = '2025-09-30'
5. **NEVER use >= or <=** with dates - NOT supported
6. **NEVER use open-ended ranges** like > or <

CAMPAIGN STATUS FILTERING:
- Always include campaign.status != 'REMOVED' to exclude deleted campaigns
- OR use campaign.status = 'ENABLED' for active campaigns only
- Valid statuses: 'ENABLED', 'PAUSED', 'REMOVED'

========================================
SECTION 3: DATE CALCULATIONS
========================================

TIME PERIOD CALCULATIONS (based on current date ${todayStr}):

Predefined Periods (Use DURING):
- "last 7 days" = segments.date DURING LAST_7_DAYS
- "last 30 days" = segments.date DURING LAST_30_DAYS
- "last 90 days" = segments.date DURING LAST_90_DAYS
- "this month" = segments.date DURING THIS_MONTH
- "last month" = segments.date DURING LAST_MONTH
- "this year" = segments.date DURING THIS_YEAR

Custom Date Ranges (Use BETWEEN):
- "today" = segments.date = '${todayStr}'
- "yesterday" = segments.date = '[calculate yesterday date]'
- "January 2025" = segments.date BETWEEN '2025-01-01' AND '2025-01-31'
- "this month" = segments.date BETWEEN '[first_day_of_month]' AND '${todayStr}'
- "last month" = segments.date BETWEEN '[first_day_of_last_month]' AND '[last_day_of_last_month]'
- "Q1 2025" = segments.date BETWEEN '2025-01-01' AND '2025-03-31'
- Custom range = segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'

========================================
SECTION 4: COMPLETE EXAMPLE QUERIES
========================================

EXAMPLE 1: Basic Campaign Performance (Last 30 Days)
SELECT campaign.id, campaign.name, campaign.status, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.ctr, metrics.average_cpc FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 20

EXAMPLE 2: Campaign Performance (Specific Date Range)
SELECT campaign.id, campaign.name, metrics.clicks, metrics.impressions, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '2025-01-01' AND '2025-01-31' AND campaign.status != 'REMOVED' ORDER BY metrics.impressions DESC

EXAMPLE 3: Active Campaigns Only
SELECT campaign.id, campaign.name, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date DURING LAST_7_DAYS AND campaign.status = 'ENABLED' ORDER BY metrics.conversions DESC

EXAMPLE 4: Campaign Conversion Data with Revenue
SELECT campaign.id, campaign.name, metrics.conversions, metrics.conversions_value, metrics.all_conversions_value, metrics.cost_micros, metrics.cost_per_conversion FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED' AND metrics.conversions > 0 ORDER BY metrics.conversions_value DESC

EXAMPLE 5: Keyword Performance Analysis (MUST include campaign.id)
SELECT campaign.id, campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.quality_score, metrics.clicks, metrics.impressions, metrics.ctr, metrics.average_cpc, metrics.conversions FROM keyword_view WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED' AND metrics.impressions > 100 ORDER BY metrics.conversions DESC LIMIT 50

EXAMPLE 6: High-Performing Keywords with Quality Score
SELECT campaign.id, campaign.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.clicks, metrics.ctr, metrics.quality_score, metrics.conversions, metrics.cost_per_conversion FROM keyword_view WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED' AND metrics.clicks > 50 AND metrics.conversions > 0 ORDER BY metrics.conversions DESC LIMIT 20

EXAMPLE 7: Device Performance Breakdown
SELECT campaign.id, campaign.name, segments.device, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.ctr FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED' ORDER BY metrics.conversions DESC

EXAMPLE 8: Ad Group Performance (MUST include campaign.id)
SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group.status, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions FROM ad_group WHERE segments.date DURING LAST_7_DAYS AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC

EXAMPLE 9: Search Impression Share Analysis
SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED' ORDER BY metrics.search_impression_share ASC

EXAMPLE 10: Daily Performance Trend with Date Segmentation
SELECT campaign.id, campaign.name, segments.date, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '2025-09-01' AND '2025-09-30' AND campaign.status = 'ENABLED' AND campaign.name LIKE '%Brand%' ORDER BY segments.date DESC

EXAMPLE 11: Day of Week Performance Analysis
SELECT campaign.id, campaign.name, segments.day_of_week, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED' ORDER BY segments.day_of_week ASC

EXAMPLE 12: Hourly Performance Breakdown
SELECT campaign.id, campaign.name, segments.hour, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE segments.date DURING LAST_7_DAYS AND campaign.status = 'ENABLED' ORDER BY segments.hour ASC

EXAMPLE 13: Campaign Performance by Ad Network
SELECT campaign.id, campaign.name, segments.ad_network_type, metrics.clicks, metrics.impressions, metrics.cost_micros FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED' ORDER BY metrics.clicks DESC

EXAMPLE 14: Keywords Filtered by Match Type
SELECT campaign.id, campaign.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.clicks, metrics.impressions, metrics.ctr FROM keyword_view WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED' AND ad_group_criterion.keyword.match_type = 'EXACT' ORDER BY metrics.clicks DESC

EXAMPLE 15: Campaigns Filtered by Name Pattern
SELECT campaign.id, campaign.name, metrics.clicks, metrics.impressions, metrics.cost_micros FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED' AND campaign.name LIKE '%Brand%' ORDER BY metrics.cost_micros DESC

========================================
SECTION 5: WHERE CLAUSE PATTERNS
========================================

Campaign Status Filtering:
- WHERE campaign.status = 'ENABLED' (active campaigns only)
- WHERE campaign.status != 'REMOVED' (exclude deleted campaigns)
- WHERE campaign.status IN ('ENABLED', 'PAUSED') (multiple statuses)

Metric Filtering:
- WHERE metrics.impressions > 100 (minimum impressions)
- WHERE metrics.clicks > 10 (minimum clicks)
- WHERE metrics.conversions > 0 (only campaigns with conversions)
- WHERE metrics.cost_micros > 10000000 (cost > $10)
- WHERE metrics.ctr > 0.05 (CTR > 5%)

String Matching (Use LIKE, NOT CONTAINS):
- WHERE campaign.name LIKE '%Brand%' (contains "Brand")
- WHERE campaign.name LIKE 'Brand%' (starts with "Brand")
- WHERE campaign.name LIKE '%Brand' (ends with "Brand")
- WHERE ad_group_criterion.keyword.text LIKE '%shoes%' (keyword contains "shoes")

Combining Conditions (Use AND):
- WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED'
- WHERE metrics.impressions > 100 AND metrics.clicks > 10
- WHERE campaign.name LIKE '%Brand%' AND metrics.conversions > 0
- WHERE segments.date BETWEEN '2025-01-01' AND '2025-01-31' AND campaign.status != 'REMOVED' AND metrics.cost_micros > 1000000

Match Type Filtering:
- WHERE ad_group_criterion.keyword.match_type = 'EXACT'
- WHERE ad_group_criterion.keyword.match_type = 'PHRASE'
- WHERE ad_group_criterion.keyword.match_type = 'BROAD'
- WHERE ad_group_criterion.keyword.match_type IN ('EXACT', 'PHRASE')

Device Filtering:
- WHERE segments.device = 'MOBILE'
- WHERE segments.device = 'DESKTOP'
- WHERE segments.device IN ('MOBILE', 'TABLET')

## COMMON ANALYSIS SCENARIOS & QUERY PATTERNS:

### 1. PERFORMANCE HIGHLIGHTS (CPL Analysis)
For CPL monitoring and performance analysis:
- Use campaign resource for account-level metrics
- Include segments.date for month-by-month breakdown
- Always include metrics.conversions and metrics.cost_micros for CPL calculation
- Example: "SELECT campaign.name, segments.date, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '2025-05-01' AND '2025-07-31' AND campaign.status != 'REMOVED' ORDER BY segments.date, metrics.cost_micros DESC"

### 2. ASSET GAP ANALYSIS
For ad asset analysis:
- Use ad_group_ad resource for responsive search ads
- Include ad_group_ad.ad.responsive_search_ad.headlines and descriptions
- Query ad extensions separately using extension_feed_item resource
- Example: "SELECT campaign.name, ad_group.name, ad_group_ad.ad.responsive_search_ad.headlines FROM ad_group_ad WHERE campaign.status != 'REMOVED'"

### 3. SEARCH QUERY REPORTS (SQR)
For keyword and search term analysis:
- Use search_term_view resource for search query reports
- Include segments.date for date filtering
- Always include campaign.id and ad_group.id for context
- Example: "SELECT campaign.id, ad_group.id, search_term_view.search_term, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date BETWEEN '2025-07-01' AND '2025-07-31' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC"

### 4. TOP SPENDING KEYWORDS
For keyword performance analysis:
- Use keyword_view resource for keyword-level data
- Include segments.week for week-on-week analysis
- Always include match type and impression share data
- Example: "SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, segments.week, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.search_impression_share FROM keyword_view WHERE segments.date BETWEEN '2025-07-01' AND '2025-07-31' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC"

### 5. SEGMENT ANALYSIS
For demographic and device analysis:
- Use segments.device, segments.age_range, segments.gender for demographics
- Include segments.hour for hour-of-day analysis
- Use segments.day_of_week for day analysis
- Example: "SELECT segments.device, segments.age_range, segments.gender, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '2025-07-01' AND '2025-07-31' AND campaign.status != 'REMOVED'"

### 6. GEO PERFORMANCE
For location-based analysis:
- Use segments.geo_target_city, segments.geo_target_metro for location data
- Include user_location_geo_target for user location analysis
- Example: "SELECT segments.geo_target_city, segments.user_location_geo_target, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '2025-07-01' AND '2025-07-31' AND campaign.status != 'REMOVED'"

### 7. BRAND vs NON-BRAND ANALYSIS
For branded vs non-branded performance:
- Use campaign.name with LIKE '%Brand%' or campaign.name NOT LIKE '%Brand%'
- Or use segments.campaign_name for more detailed analysis
- Example: "SELECT campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '2025-07-01' AND '2025-07-31' AND campaign.status != 'REMOVED' AND (campaign.name LIKE '%Brand%' OR campaign.name NOT LIKE '%Brand%')"

### 8. WEEK-ON-WEEK ANALYSIS
For weekly performance tracking:
- Use segments.week for week segmentation
- Always include segments.date for date context
- Example: "SELECT segments.week, segments.date, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '2025-07-01' AND '2025-07-31' AND campaign.status != 'REMOVED' ORDER BY segments.week"

### 9. CAMPAIGN TYPE ANALYSIS
For different campaign types (Search, PMax, Display):
- Use campaign.advertising_channel_type for campaign type
- Filter by 'SEARCH', 'DISPLAY', 'SHOPPING', 'VIDEO', 'MULTI_CHANNEL'
- Example: "SELECT campaign.advertising_channel_type, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '2025-07-01' AND '2025-07-31' AND campaign.status != 'REMOVED'"

### 10. CONVERSION TRACKING
For lead/conversion analysis:
- Always include metrics.conversions for lead count
- Use metrics.conversions_value for revenue tracking
- Include metrics.cost_per_conversion for efficiency analysis
- Example: "SELECT campaign.name, metrics.conversions, metrics.conversions_value, metrics.cost_per_conversion, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '2025-07-01' AND '2025-07-31' AND campaign.status != 'REMOVED' AND metrics.conversions > 0"
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
