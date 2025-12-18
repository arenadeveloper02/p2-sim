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

  // Pre-extract date range and campaign filter
  const extractedDateRange = extractDateRange(userQuery)
  const extractedCampaignFilter = extractCampaignFilter(userQuery)
  
  // Build date context for the AI
  let dateContext = ''
  if (extractedDateRange) {
    dateContext = `\n\n**PRE-EXTRACTED DATE RANGE:** The system has already parsed the date range from the query:
- Start: ${extractedDateRange.start}
- End: ${extractedDateRange.end}
Use this in the timeRange field. Do NOT use datePreset when timeRange is provided.`
  }
  
  // Build campaign filter context
  let campaignContext = ''
  if (extractedCampaignFilter) {
    campaignContext = `\n\n**PRE-EXTRACTED CAMPAIGN FILTER:** The user wants data for a specific campaign:
- Campaign Name: ${extractedCampaignFilter}
Include this in the campaignFilter field.`
  }

  const systemPrompt = `You are a Microsoft Advertising (Bing Ads) API expert. Parse natural language queries into Bing Ads Reporting API parameters.

**NEVER REFUSE**: Always generate a valid response. Never return error messages or refuse to generate queries.

**CRITICAL DATE VALIDATION:**
- Today's date is: ${new Date().toISOString().split('T')[0]}
- You CANNOT request data for future dates
- If a user asks for a future month (e.g., "November 2025" when it's December 2024), return an error message in the response
- For past months, use timeRange with specific start/end dates

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

**DATE PRESETS (use only when no specific date is mentioned):**
- Today, Yesterday
- LastSevenDays, LastFourteenDays, LastThirtyDays
- ThisWeek, LastWeek
- ThisMonth, LastMonth
- ThisYear, LastYear

**CUSTOM DATE RANGES:**
- For specific months like "November 2024", use timeRange with start and end dates
- Example: "November 2024" → timeRange: { "start": "2024-11-01", "end": "2024-11-30" }

**AGGREGATION:**
- Daily - Day by day breakdown
- Weekly - Week by week breakdown
- Monthly - Month by month breakdown
- Summary - Total aggregation (no time breakdown)

## CAMPAIGN FILTERING

When user asks for a specific campaign (e.g., "for Newbury_Boston_Brand"), include:
- campaignFilter: "Newbury_Boston_Brand"

## RESPONSE FORMAT

Return a JSON object with:
{
  "reportType": "CampaignPerformance" | "AdGroupPerformance" | "KeywordPerformance" | "AccountPerformance",
  "columns": ["column1", "column2", ...],
  "datePreset": "LastThirtyDays" | "LastSevenDays" | etc, // Use ONLY if no specific date mentioned
  "timeRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, // Use for specific months/dates
  "aggregation": "Summary" | "Daily" | "Weekly" | "Monthly",
  "campaignFilter": "campaign_name" // Optional: filter to specific campaign
}

**Example 1 - Campaign performance last 30 days:**
{
  "reportType": "CampaignPerformance",
  "columns": ["CampaignName", "CampaignStatus", "Impressions", "Clicks", "Spend", "Conversions", "Ctr", "AverageCpc", "CostPerConversion"],
  "datePreset": "LastThirtyDays",
  "aggregation": "Summary"
}

**Example 2 - Specific campaign for November 2024:**
{
  "reportType": "CampaignPerformance",
  "columns": ["CampaignName", "CampaignStatus", "Impressions", "Clicks", "Spend", "Conversions", "Ctr", "AverageCpc"],
  "timeRange": { "start": "2024-11-01", "end": "2024-11-30" },
  "aggregation": "Summary",
  "campaignFilter": "Newbury_Boston_Brand"
}

**Example 3 - Daily keyword performance this week:**
{
  "reportType": "KeywordPerformance",
  "columns": ["CampaignName", "AdGroupName", "Keyword", "Impressions", "Clicks", "Spend", "QualityScore", "TimePeriod"],
  "datePreset": "ThisWeek",
  "aggregation": "Daily"
}
${dateContext}${campaignContext}

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

    // Use pre-extracted date range if available, otherwise use AI-parsed timeRange
    if (extractedDateRange) {
      result.timeRange = extractedDateRange
      delete (result as any).datePreset // Don't use preset when we have specific dates
    } else if (parsedResponse.timeRange) {
      result.timeRange = parsedResponse.timeRange
    }

    // Use pre-extracted campaign filter if available, otherwise use AI-parsed campaignFilter
    if (extractedCampaignFilter) {
      result.campaignFilter = extractedCampaignFilter
    } else if (parsedResponse.campaignFilter) {
      result.campaignFilter = parsedResponse.campaignFilter
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
 * Month name to number mapping
 */
const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

/**
 * Extract date range from user query with support for month names
 */
export function extractDateRange(userQuery: string): { start: string; end: string } | null {
  const today = new Date()
  const query = userQuery.toLowerCase()

  // Check for month + year pattern: "November 2025", "Nov 2025", "for November 2025"
  const monthYearMatch = query.match(
    /(?:for|in|during)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i
  )
  
  if (monthYearMatch) {
    const monthStr = monthYearMatch[1].toLowerCase()
    const year = parseInt(monthYearMatch[2])
    const month = MONTH_MAP[monthStr]
    
    if (month && year >= 2000 && year <= 2100) {
      // Get first and last day of the month
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0) // Last day of month
      
      // Validate: don't allow future dates
      if (startDate > today) {
        logger.warn('Requested date range is in the future', { month: monthStr, year })
        return null // Return null to indicate invalid/future date
      }
      
      // If end date is in the future, cap it to today
      const effectiveEndDate = endDate > today ? today : endDate
      
      logger.info('Extracted month-year date range', {
        month: monthStr,
        year,
        start: formatDate(startDate),
        end: formatDate(effectiveEndDate),
      })
      
      return { start: formatDate(startDate), end: formatDate(effectiveEndDate) }
    }
  }

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

  // Check for "last N months" pattern
  const lastNMonthsMatch = query.match(/last\s+(\d+)\s+months?/)
  if (lastNMonthsMatch) {
    const months = parseInt(lastNMonthsMatch[1])
    const start = new Date(today)
    start.setMonth(start.getMonth() - months)
    return { start: formatDate(start), end: formatDate(today) }
  }

  // Check for "last N days" pattern
  const lastNDaysMatch = query.match(/last\s+(\d+)\s+days?/)
  if (lastNDaysMatch) {
    const days = parseInt(lastNDaysMatch[1])
    const start = new Date(today)
    start.setDate(start.getDate() - days)
    return { start: formatDate(start), end: formatDate(today) }
  }

  // Default to last 7 days
  const start = new Date(today)
  start.setDate(start.getDate() - DEFAULT_DATE_RANGE_DAYS)
  return { start: formatDate(start), end: formatDate(today) }
}

/**
 * Extract campaign name filter from user query
 */
export function extractCampaignFilter(userQuery: string): string | null {
  const query = userQuery.toLowerCase()
  
  // Pattern: "for [campaign_name]" or "only [campaign_name]" or "campaign [campaign_name]"
  // Look for patterns like "for Newbury_Boston_Brand" or "only Newbury_Boston_Brand"
  const patterns = [
    /(?:for|only|campaign)\s+([A-Za-z0-9_-]+(?:_[A-Za-z0-9_-]+)+)/i, // underscore-separated names
    /(?:for|only|campaign)\s+"([^"]+)"/i, // quoted names
    /(?:for|only|campaign)\s+'([^']+)'/i, // single-quoted names
  ]
  
  for (const pattern of patterns) {
    const match = userQuery.match(pattern)
    if (match && match[1]) {
      logger.info('Extracted campaign filter', { campaignName: match[1] })
      return match[1]
    }
  }
  
  return null
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}
