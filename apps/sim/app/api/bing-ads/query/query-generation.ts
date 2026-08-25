/**
 * Bing Ads Query Generation
 * Uses AI to generate Bing Ads queries with dynamic date calculation
 */

import { executeProviderRequest } from '@/providers'
import type { ProviderResponse } from '@/providers/types'
import { resolveAIProvider } from './ai-provider'
import { getBingAdsSystemPrompt } from './prompt'
import type { BingAdsQueryResponse } from './types'

/**
 * Generates a Bing Ads query using AI
 *
 * @param query - Natural language query from user
 * @returns Parsed Bing Ads query parameters
 */
export async function generateBingAdsQuery(query: string): Promise<BingAdsQueryResponse> {
  try {
    const { provider, model, apiKey, thinkingLevel } = resolveAIProvider()
    const systemPrompt = await getBingAdsSystemPrompt()

    const aiResponse = (await executeProviderRequest(provider, {
      model,
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: query,
        },
      ],
      apiKey,
      temperature: 0.1,
      maxTokens: 2048,
      thinkingLevel,
    })) as ProviderResponse

    const content =
      typeof aiResponse === 'string'
        ? aiResponse
        : 'content' in aiResponse
          ? aiResponse.content
          : null

    if (!content || typeof content !== 'string') {
      throw new Error('No content received from AI API')
    }

    const parsedQuery = parseAIResponse(content)
    validateParsedQuery(parsedQuery)

    return parsedQuery
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    throw new Error(`Failed to generate Bing Ads query: ${errorMessage}`)
  }
}

/**
 * Parses AI response and extracts Bing Ads parameters
 *
 * @param content - Raw AI response content
 * @returns Parsed Bing Ads query parameters
 */
function parseAIResponse(content: string): BingAdsQueryResponse {
  try {
    // Models may wrap JSON in markdown; extract the object first
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content)

    // Ensure required fields
    if (!parsed.reportType) {
      throw new Error('Missing reportType in AI response')
    }

    if (!parsed.columns || !Array.isArray(parsed.columns)) {
      throw new Error('Missing or invalid columns in AI response')
    }

    if (!parsed.timeRange || !parsed.timeRange.start || !parsed.timeRange.end) {
      throw new Error('Missing or invalid timeRange in AI response')
    }

    // Validate date format
    const startDate = new Date(parsed.timeRange.start)
    const endDate = new Date(parsed.timeRange.end)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new Error('Invalid date format in timeRange')
    }

    if (startDate > endDate) {
      throw new Error('Start date cannot be after end date')
    }

    const metricColumns = (parsed.columns as string[]).filter((column) =>
      METRIC_COLUMN_NAMES.has(column.replace(/"/g, '').trim())
    )

    return {
      reportType: parsed.reportType,
      columns: parsed.columns,
      timeRange: {
        start: parsed.timeRange.start,
        end: parsed.timeRange.end,
      },
      aggregation: parsed.aggregation || 'Summary',
      query_type: asOptionalString(parsed.query_type) || inferQueryType(parsed.reportType),
      tables_used: Array.isArray(parsed.tables_used)
        ? parsed.tables_used
        : inferTables(parsed.reportType),
      metrics_used: Array.isArray(parsed.metrics_used)
        ? parsed.metrics_used
        : metricColumns.map((column) => column.toLowerCase()),
      campaignFilter: asOptionalString(parsed.campaignFilter),
      adGroupFilter: asOptionalString(parsed.adGroupFilter),
      keywordFilter: asOptionalString(parsed.keywordFilter),
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON format in AI response')
    }
    throw error
  }
}

/**
 * Validates the parsed query parameters
 *
 * @param parsedQuery - Parsed query parameters
 */
function validateParsedQuery(parsedQuery: BingAdsQueryResponse): void {
  // Validate report type
  const validReportTypes = [
    'CampaignPerformance',
    'AdGroupPerformance',
    'KeywordPerformance',
    'AccountPerformance',
    'SearchQueryPerformance',
  ]

  if (!validReportTypes.includes(parsedQuery.reportType)) {
    throw new Error(`Invalid reportType: ${parsedQuery.reportType}`)
  }

  // Validate required columns
  const requiredColumns = ['AccountName', 'AccountId']
  for (const column of requiredColumns) {
    if (!parsedQuery.columns.includes(column)) {
      throw new Error(`Missing required column: ${column}`)
    }
  }

  // Validate aggregation
  const validAggregations = ['Summary', 'Daily', 'Weekly', 'Monthly']
  if (!validAggregations.includes(parsedQuery.aggregation || 'Summary')) {
    throw new Error(`Invalid aggregation: ${parsedQuery.aggregation}`)
  }
}

const METRIC_COLUMN_NAMES = new Set([
  'Impressions',
  'Clicks',
  'Spend',
  'Conversions',
  'Ctr',
  'AverageCpc',
  'CostPerConversion',
  'AveragePosition',
  'ImpressionSharePercent',
  'Revenue',
  'ReturnOnAdSpend',
  'TopImpressionRatePercent',
  'AbsoluteTopImpressionRatePercent',
  'Downloads',
  'CostPerDownload',
  'Installs',
  'CostPerInstall',
])

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function inferQueryType(reportType: string): string {
  if (reportType === 'KeywordPerformance') return 'keywords'
  if (reportType === 'SearchQueryPerformance') return 'search_terms'
  if (reportType === 'AdGroupPerformance') return 'ad_groups'
  if (reportType === 'AccountPerformance') return 'account'
  return 'campaigns'
}

function inferTables(reportType: string): string[] {
  if (reportType === 'KeywordPerformance') return ['keyword']
  if (reportType === 'SearchQueryPerformance') return ['search_query']
  if (reportType === 'AdGroupPerformance') return ['ad_group']
  if (reportType === 'AccountPerformance') return ['account']
  return ['campaign']
}
