import type { DateRange } from './types'

export type Intent =
  | 'campaign_performance'
  | 'account_performance'
  | 'ad_group_performance'
  | 'keyword_performance'
  | 'search_terms'
  | 'geographic'
  | 'device_performance'
  | 'conversion_tracking'
  | 'budget_analysis'

export interface PromptContext {
  dateRange?: DateRange
  campaignFilter?: string
  accountFilter?: string
}

type FragmentBuilder = (context: PromptContext) => string

export const BASE_PROMPT = `
You are a Microsoft Advertising (Bing Ads) Reporting API expert. Generate valid report parameters for ANY Bing Ads question.

**NEVER REFUSE**: Always generate a valid response. Never return error messages or refuse to generate queries.

**CRITICAL: ACCOUNT CONTEXT**: The user has already selected a specific Bing Ads account. When they mention the account name in their query, DO NOT add it as a filter. The account is already selected by the API.

## REPORT TYPES - CHOOSE CORRECTLY

**CRITICAL REPORT TYPE RULES:**
- CampaignPerformance - Use for campaign-level metrics (DEFAULT for most queries)
- AccountPerformance - Use ONLY when user explicitly asks for "account total", "account level", or "overall account"
- AdGroupPerformance - Use for ad group-level metrics
- KeywordPerformance - Use for keyword-level metrics
- SearchQueryPerformance - Use for search term reports

**WHEN TO USE EACH REPORT TYPE:**
- "performance" → CampaignPerformance
- "campaigns" → CampaignPerformance
- "all campaigns" → CampaignPerformance
- "show me campaigns" → CampaignPerformance
- "campaign performance" → CampaignPerformance
- "account total" → AccountPerformance
- "account level" → AccountPerformance
- "overall performance" → AccountPerformance (only if no campaign mentioned)
- "ad groups" → AdGroupPerformance
- "keywords" → KeywordPerformance
- "search terms" → SearchQueryPerformance

## AVAILABLE COLUMNS BY REPORT TYPE

**CampaignPerformance Columns:**
- Required: CampaignName, CampaignId, CampaignStatus
- Metrics: Impressions, Clicks, Spend, Conversions, Revenue
- Calculated: Ctr, AverageCpc, CostPerConversion, ConversionRate
- Optional: AccountName, AccountId

**AccountPerformance Columns:**
- Required: AccountName, AccountId
- Metrics: Impressions, Clicks, Spend, Conversions, Revenue
- Calculated: Ctr, AverageCpc, CostPerConversion, ConversionRate

**AdGroupPerformance Columns:**
- Required: CampaignName, AdGroupName, AdGroupId, AdGroupStatus
- Metrics: Impressions, Clicks, Spend, Conversions, Revenue
- Calculated: Ctr, AverageCpc, CostPerConversion

**KeywordPerformance Columns:**
- Required: CampaignName, AdGroupName, Keyword, KeywordId, KeywordStatus
- Metrics: Impressions, Clicks, Spend, Conversions
- Quality: QualityScore

## DATE PRESETS

**Available Date Presets:**
- Today, Yesterday
- LastSevenDays, LastFourteenDays, LastThirtyDays
- ThisWeek, LastWeek
- ThisMonth, LastMonth
- ThisYear, LastYear

**Custom Date Ranges:**
- For specific months like "November 2024", use timeRange with start and end dates
- Example: "November 2024" → timeRange: { "start": "2024-11-01", "end": "2024-11-30" }

## AGGREGATION LEVELS

**Aggregation Options:**
- Summary - Total aggregation (no time breakdown) - DEFAULT
- Daily - Day by day breakdown (include TimePeriod column)
- Weekly - Week by week breakdown (include TimePeriod column)
- Monthly - Month by month breakdown (include TimePeriod column)

**CRITICAL: TimePeriod Column Rule:**
- DO NOT include TimePeriod column when aggregation is "Summary"
- ONLY include TimePeriod when aggregation is Daily, Weekly, or Monthly

## RESPONSE FORMAT

Return a JSON object with:
{
  "reportType": "CampaignPerformance" | "AdGroupPerformance" | "KeywordPerformance" | "AccountPerformance",
  "columns": ["column1", "column2", ...],
  "datePreset": "LastThirtyDays" | "LastSevenDays" | etc,
  "timeRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "aggregation": "Summary" | "Daily" | "Weekly" | "Monthly",
  "campaignFilter": "campaign_name"
}

## EXAMPLES

**Example 1 - "Show me all campaigns for last 7 days":**
{
  "reportType": "CampaignPerformance",
  "columns": ["CampaignName", "CampaignId", "CampaignStatus", "Impressions", "Clicks", "Spend", "Conversions", "Ctr", "AverageCpc", "CostPerConversion"],
  "datePreset": "LastSevenDays",
  "aggregation": "Summary"
}

**Example 2 - "Give me performance for last 30 days":**
{
  "reportType": "CampaignPerformance",
  "columns": ["CampaignName", "CampaignId", "CampaignStatus", "Impressions", "Clicks", "Spend", "Conversions", "Ctr", "AverageCpc", "CostPerConversion"],
  "datePreset": "LastThirtyDays",
  "aggregation": "Summary"
}

**Example 3 - "Account total for this month":**
{
  "reportType": "AccountPerformance",
  "columns": ["AccountName", "AccountId", "Impressions", "Clicks", "Spend", "Conversions", "Ctr", "AverageCpc", "CostPerConversion"],
  "datePreset": "ThisMonth",
  "aggregation": "Summary"
}

**Example 4 - "Daily performance for November 2024":**
{
  "reportType": "CampaignPerformance",
  "columns": ["CampaignName", "CampaignId", "TimePeriod", "Impressions", "Clicks", "Spend", "Conversions"],
  "timeRange": { "start": "2024-11-01", "end": "2024-11-30" },
  "aggregation": "Daily"
}

**Example 5 - "Show me ad groups in Brand campaign":**
{
  "reportType": "AdGroupPerformance",
  "columns": ["CampaignName", "AdGroupName", "AdGroupId", "AdGroupStatus", "Impressions", "Clicks", "Spend", "Conversions"],
  "datePreset": "LastThirtyDays",
  "aggregation": "Summary",
  "campaignFilter": "Brand"
}

**Example 6 - "Keyword performance for last week":**
{
  "reportType": "KeywordPerformance",
  "columns": ["CampaignName", "AdGroupName", "Keyword", "KeywordId", "Impressions", "Clicks", "Spend", "QualityScore"],
  "datePreset": "LastWeek",
  "aggregation": "Summary"
}

Always return valid JSON. Never refuse to generate a response.
`

// Intent detection patterns
export const INTENT_PATTERNS: Record<Intent, RegExp[]> = {
  campaign_performance: [
    /campaign/i,
    /campaigns/i,
    /performance/i,
    /show me/i,
    /give me/i,
    /what('s| is)/i,
  ],
  account_performance: [
    /account total/i,
    /account level/i,
    /overall account/i,
    /total account/i,
    /account performance/i,
  ],
  ad_group_performance: [
    /ad group/i,
    /adgroup/i,
    /ad groups/i,
  ],
  keyword_performance: [
    /keyword/i,
    /keywords/i,
    /quality score/i,
  ],
  search_terms: [
    /search term/i,
    /search query/i,
    /search queries/i,
  ],
  geographic: [
    /geographic/i,
    /location/i,
    /geo/i,
    /country/i,
    /region/i,
  ],
  device_performance: [
    /device/i,
    /mobile/i,
    /desktop/i,
    /tablet/i,
  ],
  conversion_tracking: [
    /conversion/i,
    /conversions/i,
    /convert/i,
  ],
  budget_analysis: [
    /budget/i,
    /spend/i,
    /cost/i,
  ],
}

// Detect intent from user query
export function detectIntent(query: string): Intent {
  const lowerQuery = query.toLowerCase()
  
  // Check for account-level queries first (more specific)
  if (INTENT_PATTERNS.account_performance.some(p => p.test(lowerQuery))) {
    return 'account_performance'
  }
  
  // Check for ad group queries
  if (INTENT_PATTERNS.ad_group_performance.some(p => p.test(lowerQuery))) {
    return 'ad_group_performance'
  }
  
  // Check for keyword queries
  if (INTENT_PATTERNS.keyword_performance.some(p => p.test(lowerQuery))) {
    return 'keyword_performance'
  }
  
  // Check for search term queries
  if (INTENT_PATTERNS.search_terms.some(p => p.test(lowerQuery))) {
    return 'search_terms'
  }
  
  // Default to campaign performance for general queries
  return 'campaign_performance'
}

// Get report type based on intent
export function getReportTypeForIntent(intent: Intent): string {
  switch (intent) {
    case 'account_performance':
      return 'AccountPerformance'
    case 'ad_group_performance':
      return 'AdGroupPerformance'
    case 'keyword_performance':
      return 'KeywordPerformance'
    case 'search_terms':
      return 'SearchQueryPerformance'
    case 'campaign_performance':
    default:
      return 'CampaignPerformance'
  }
}

// Get default columns for report type
export function getDefaultColumnsForReportType(reportType: string): string[] {
  switch (reportType) {
    case 'AccountPerformance':
      return ['AccountName', 'AccountId', 'Impressions', 'Clicks', 'Spend', 'Conversions', 'Ctr', 'AverageCpc', 'CostPerConversion']
    case 'AdGroupPerformance':
      return ['CampaignName', 'AdGroupName', 'AdGroupId', 'AdGroupStatus', 'Impressions', 'Clicks', 'Spend', 'Conversions', 'Ctr', 'AverageCpc']
    case 'KeywordPerformance':
      return ['CampaignName', 'AdGroupName', 'Keyword', 'KeywordId', 'KeywordStatus', 'Impressions', 'Clicks', 'Spend', 'Conversions', 'QualityScore']
    case 'SearchQueryPerformance':
      return ['CampaignName', 'AdGroupName', 'SearchQuery', 'Impressions', 'Clicks', 'Spend', 'Conversions']
    case 'CampaignPerformance':
    default:
      return ['CampaignName', 'CampaignId', 'CampaignStatus', 'Impressions', 'Clicks', 'Spend', 'Conversions', 'Ctr', 'AverageCpc', 'CostPerConversion']
  }
}
