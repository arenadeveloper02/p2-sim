import { createLogger } from '@/lib/logs/console/logger'
import { executeProviderRequest } from '@/providers'
import { getApiKey } from '@/providers/utils'
import { CAMPAIGN_PERFORMANCE_COLUMNS, DATE_PRESETS, DEFAULT_DATE_RANGE_DAYS } from './constants'
import type { ParsedBingQuery } from './types'

const logger = createLogger('BingAdsAI')

/**
 * Parse natural language query into Bing Ads report parameters using AI
 */
export async function parseQueryWithAI(
  userQuery: string,
  accountName: string
): Promise<ParsedBingQuery> {
  logger.info('Parsing Bing Ads query with AI', { userQuery, accountName })

  const systemPrompt = `You are a Microsoft Advertising (Bing Ads) API expert. Parse natural language queries into Bing Ads Reporting API parameters.

**NEVER REFUSE**: Always generate a valid response. Never return error messages or refuse to generate queries.

## BING ADS REPORTING STRUCTURE

**REPORT TYPES:**
- CampaignPerformance - Campaign-level metrics
- AdGroupPerformance - Ad group-level metrics  
- KeywordPerformance - Keyword-level metrics
- AccountPerformance - Account-level aggregation

**AVAILABLE COLUMNS:**
- Basic: AccountName, AccountId, CampaignName, CampaignId, CampaignStatus
- Ad Group: AdGroupName, AdGroupId, AdGroupStatus
- Keyword: Keyword, KeywordId, KeywordStatus, QualityScore
- Metrics: Impressions, Clicks, Spend, Conversions, Revenue
- Calculated: Ctr, AverageCpc, CostPerConversion, ConversionRate
- Share: ImpressionSharePercent
- Time: TimePeriod

**DATE PRESETS:**
- Today, Yesterday
- LastSevenDays, LastFourteenDays, LastThirtyDays
- ThisWeek, LastWeek
- ThisMonth, LastMonth
- ThisYear, LastYear

**AGGREGATION:**
- Daily - Day by day breakdown
- Weekly - Week by week breakdown
- Monthly - Month by month breakdown
- Summary - Total aggregation (no time breakdown)

## QUERY TYPE DETECTION

**For "campaign performance" or general queries:**
- reportType: "CampaignPerformance"
- columns: ["CampaignName", "CampaignStatus", "Impressions", "Clicks", "Spend", "Conversions", "Ctr", "AverageCpc"]

**For "ad group" queries:**
- reportType: "AdGroupPerformance"
- columns: ["CampaignName", "AdGroupName", "AdGroupStatus", "Impressions", "Clicks", "Spend", "Conversions"]

**For "keyword" queries:**
- reportType: "KeywordPerformance"
- columns: ["CampaignName", "AdGroupName", "Keyword", "KeywordStatus", "Impressions", "Clicks", "Spend", "QualityScore"]

## RESPONSE FORMAT

Return a JSON object with:
{
  "reportType": "CampaignPerformance" | "AdGroupPerformance" | "KeywordPerformance" | "AccountPerformance",
  "columns": ["column1", "column2", ...],
  "datePreset": "LastThirtyDays" | "LastSevenDays" | etc,
  "timeRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } // Only if custom date range
  "aggregation": "Summary" | "Daily" | "Weekly" | "Monthly"
}

**Example 1 - Campaign performance last 30 days:**
{
  "reportType": "CampaignPerformance",
  "columns": ["CampaignName", "CampaignStatus", "Impressions", "Clicks", "Spend", "Conversions", "Ctr", "AverageCpc", "CostPerConversion"],
  "datePreset": "LastThirtyDays",
  "aggregation": "Summary"
}

**Example 2 - Daily keyword performance this week:**
{
  "reportType": "KeywordPerformance",
  "columns": ["CampaignName", "AdGroupName", "Keyword", "Impressions", "Clicks", "Spend", "QualityScore", "TimePeriod"],
  "datePreset": "ThisWeek",
  "aggregation": "Daily"
}

Always return valid JSON. Never refuse to generate a response.`

  try {
    const apiKey = getApiKey('openai', 'gpt-4o')

    logger.info('Making AI request for Bing Ads query parsing', {
      hasApiKey: !!apiKey,
      model: 'gpt-4o',
    })

    const responseInstructions = [
      'Respond with EXACTLY ONE valid JSON object. No additional text, no multiple JSON objects, no explanations.',
      'CRITICAL: Always include relevant columns for the report type.',
      'For time-based queries, include TimePeriod in columns and set appropriate aggregation.',
      'Default to LastThirtyDays if no time period is specified.',
    ].join('\n')

    const fullSystemPrompt = `${systemPrompt}\n\n${responseInstructions}`

    const aiResponse = await executeProviderRequest('openai', {
      model: 'gpt-4o',
      systemPrompt: fullSystemPrompt,
      context: `Parse this Bing Ads question for account "${accountName}": "${userQuery}"`,
      messages: [
        {
          role: 'user',
          content: `Parse this Bing Ads question: "${userQuery}"`,
        },
      ],
      apiKey,
      temperature: 0.0,
      maxTokens: 1000,
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

    // Post-processing: Ensure required fields
    const reportType = parsedResponse.reportType || 'CampaignPerformance'
    const columns = parsedResponse.columns || CAMPAIGN_PERFORMANCE_COLUMNS
    const datePreset = parsedResponse.datePreset || 'LastThirtyDays'
    const aggregation = parsedResponse.aggregation || 'Summary'

    // Ensure AccountName and AccountId are always included
    if (!columns.includes('AccountName')) {
      columns.unshift('AccountName')
    }
    if (!columns.includes('AccountId')) {
      columns.splice(1, 0, 'AccountId')
    }

    const result: ParsedBingQuery = {
      reportType,
      columns,
      datePreset,
      aggregation,
    }

    if (parsedResponse.timeRange) {
      result.timeRange = parsedResponse.timeRange
    }

    logger.info('Parsed Bing Ads query', { result })

    return result
  } catch (error) {
    logger.error('AI query parsing failed, using defaults', { error, userQuery })

    // Return sensible defaults on error
    return {
      reportType: 'CampaignPerformance',
      columns: CAMPAIGN_PERFORMANCE_COLUMNS,
      datePreset: 'LastThirtyDays',
      aggregation: 'Summary',
    }
  }
}

/**
 * Extract date range from user query
 */
export function extractDateRange(userQuery: string): { start: string; end: string } | null {
  const today = new Date()
  const query = userQuery.toLowerCase()

  // Check for relative date mentions
  if (query.includes('today')) {
    const dateStr = formatDate(today)
    return { start: dateStr, end: dateStr }
  }

  if (query.includes('yesterday')) {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = formatDate(yesterday)
    return { start: dateStr, end: dateStr }
  }

  if (query.includes('last 7 days') || query.includes('last week')) {
    const start = new Date(today)
    start.setDate(start.getDate() - 7)
    return { start: formatDate(start), end: formatDate(today) }
  }

  if (query.includes('last 30 days') || query.includes('last month')) {
    const start = new Date(today)
    start.setDate(start.getDate() - 30)
    return { start: formatDate(start), end: formatDate(today) }
  }

  if (query.includes('this month')) {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start: formatDate(start), end: formatDate(today) }
  }

  // Default to last 7 days
  const start = new Date(today)
  start.setDate(start.getDate() - DEFAULT_DATE_RANGE_DAYS)
  return { start: formatDate(start), end: formatDate(today) }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}
