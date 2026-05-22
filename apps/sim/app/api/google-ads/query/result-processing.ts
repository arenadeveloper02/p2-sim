import { createLogger } from '@sim/logger'
import { MICROS_PER_DOLLAR } from './constants'
import type { Campaign, ProcessedResults } from './types'

const logger = createLogger('ResultProcessing')

const ID_FIELD_HINTS = ['id', 'Id', 'criterionId', 'customerId']
const MICROS_FIELD_HINTS = [
  'costMicros',
  'averageCpc',
  'averageCpm',
  'costPerConversion',
  'costPerAllConversions',
  'amountMicros',
]

function isIdField(key: string): boolean {
  return ID_FIELD_HINTS.some((hint) => key === hint || key.endsWith(hint))
}

function isMicrosField(key: string): boolean {
  return MICROS_FIELD_HINTS.includes(key) || /micros$/i.test(key)
}

/**
 * Recursively formats a single GAQL row:
 * - preserves nested structure (campaign, adGroup, metrics, segments, asset, ...)
 * - keeps ID-like fields as strings
 * - converts numeric strings to numbers
 * - drops the `resourceName` field
 * - adds *_dollars sibling fields for any *Micros numeric field
 */
function formatRow(node: any): any {
  if (node === null || node === undefined) return node
  if (Array.isArray(node)) return node.map((item) => formatRow(item))
  if (typeof node !== 'object') return node

  const formatted: Record<string, any> = {}

  for (const [key, value] of Object.entries(node)) {
    if (key === 'resourceName') continue

    if (value === null || value === undefined) {
      formatted[key] = value
      continue
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      formatted[key] = formatRow(value)
      continue
    }

    if (Array.isArray(value)) {
      formatted[key] = value.map((item) => formatRow(item))
      continue
    }

    if (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value))) {
      formatted[key] = isIdField(key) ? value : Number.parseFloat(value)
      continue
    }

    formatted[key] = value
  }

  for (const [key, value] of Object.entries(formatted)) {
    if (typeof value === 'number' && isMicrosField(key)) {
      const dollarKey = key.endsWith('Micros')
        ? `${key.slice(0, -'Micros'.length)}_dollars`
        : `${key}_dollars`
      formatted[dollarKey] = Math.round((value / MICROS_PER_DOLLAR) * 100) / 100
    }
  }

  return formatted
}

/**
 * Resource-agnostic totals across formatted rows.
 * Sums every metric we can find. Works for campaigns, keywords, search terms,
 * devices, audiences, geo, etc. Returns undefined if no metrics found.
 */
function calculateGenericTotals(rows: any[]): Record<string, number> | undefined {
  if (rows.length === 0) return undefined

  const sumFields = [
    'impressions',
    'clicks',
    'conversions',
    'conversionsValue',
    'allConversions',
    'allConversionsValue',
    'costMicros',
  ]

  const totals: Record<string, number> = {}

  for (const row of rows) {
    const metrics = row?.metrics
    if (!metrics) continue
    for (const field of sumFields) {
      const value = metrics[field]
      if (value === undefined || value === null) continue
      const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value))
      if (Number.isNaN(numeric)) continue
      totals[field] = (totals[field] ?? 0) + numeric
    }
  }

  if (Object.keys(totals).length === 0) return undefined

  if (totals.costMicros !== undefined) {
    totals.cost_dollars = Math.round((totals.costMicros / MICROS_PER_DOLLAR) * 100) / 100
  }
  if (totals.impressions && totals.clicks !== undefined) {
    totals.ctr = Math.round((totals.clicks / totals.impressions) * 10000) / 100
  }
  if (totals.clicks && totals.costMicros !== undefined) {
    totals.average_cpc_dollars =
      Math.round((totals.costMicros / totals.clicks / MICROS_PER_DOLLAR) * 100) / 100
  }
  if (totals.conversions && totals.costMicros !== undefined) {
    totals.cost_per_conversion_dollars =
      Math.round((totals.costMicros / totals.conversions / MICROS_PER_DOLLAR) * 100) / 100
  }
  if (totals.costMicros !== undefined && totals.conversionsValue !== undefined) {
    const costDollars = totals.costMicros / MICROS_PER_DOLLAR
    totals.roas = costDollars > 0 ? Math.round((totals.conversionsValue / costDollars) * 100) / 100 : 0
  }
  if (totals.clicks && totals.conversions !== undefined) {
    totals.conversion_rate = Math.round((totals.conversions / totals.clicks) * 10000) / 100
  }
  if (Number.isFinite(totals.conversionsValue)) {
    totals.conversionsValue = Math.round(totals.conversionsValue * 100) / 100
  }

  return totals
}

/**
 * Detects the dominant resource of a query so the response can label rows
 * (campaigns, keywords, search_terms, ads, ...).
 */
function detectResource(gaqlQuery: string, rows: any[]): string {
  const fromMatch = gaqlQuery.match(/FROM\s+([a-z_]+)/i)
  if (fromMatch) return fromMatch[1].toLowerCase()
  const first = rows[0]
  if (!first) return 'unknown'
  if (first.searchTermView) return 'search_term_view'
  if (first.adGroupCriterion) return 'keyword_view'
  if (first.adGroupAd) return 'ad_group_ad'
  if (first.adGroup) return 'ad_group'
  if (first.campaign) return 'campaign'
  return 'unknown'
}

/**
 * Processes Google Ads API results.
 *
 * Returns BOTH:
 * - the legacy campaign-shaped output (campaigns[], accountTotals) so existing
 *   consumers and the comparison response keep working,
 * - a resource-agnostic `rows` array + `genericTotals` so keyword / search-term
 *   / ad / asset / device / audience queries no longer lose data.
 */
export function processGoogleAdsResults(
  apiResult: any,
  requestId: string,
  gaqlQuery: string,
  periodLabel = 'primary'
): ProcessedResults {
  const campaigns: Campaign[] = []
  const result: any[] = []
  const rawRows: any[] = []
  let accountClicks = 0
  let accountImpressions = 0
  let accountCost = 0
  let accountConversions = 0
  let accountConversionsValue = 0

  if (!apiResult?.results || !Array.isArray(apiResult.results)) {
    logger.warn(`[${requestId}] No results found in Google Ads API response (${periodLabel})`, {
      hasResults: !!apiResult?.results,
      resultsType: typeof apiResult?.results,
      isArray: Array.isArray(apiResult?.results),
      apiResultKeys: apiResult ? Object.keys(apiResult) : [],
    })

    return {
      result,
      rows: [],
      campaigns,
      gaqlQuery,
      resource: detectResource(gaqlQuery, []),
      accountTotals: {
        clicks: 0,
        impressions: 0,
        cost: 0,
        conversions: 0,
        conversions_value: 0,
      },
      genericTotals: undefined,
    }
  }

  logger.info(
    `[${requestId}] Processing ${apiResult.results.length} results from Google Ads API (${periodLabel} period)`
  )

  for (const gaqlResult of apiResult.results) {
    rawRows.push(gaqlResult)

    const mappedResult: any = { ...gaqlResult }
    result.push(mappedResult)

    const campaignData = gaqlResult.campaign
    const metricsData = gaqlResult.metrics

    if (!metricsData) continue

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

    accountClicks += clicks
    accountImpressions += impressions
    accountCost += costMicros
    accountConversions += conversions
    accountConversionsValue += conversionsValue

    if (!campaignData) continue

    const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0

    const campaignInfo: Campaign = {
      name: campaignData?.name || 'Unknown',
      status: campaignData?.status || 'Unknown',
      clicks,
      impressions,
      cost: Math.round((costMicros / MICROS_PER_DOLLAR) * 100) / 100,
      conversions,
      conversions_value: Math.round(conversionsValue * 100) / 100,
      ctr: Math.round(Number.parseFloat(metricsData.ctr || '0') * 10000) / 100,
      avg_cpc: Math.round((avgCpcMicros / MICROS_PER_DOLLAR) * 100) / 100,
      cost_per_conversion:
        costPerConversionMicros > 0
          ? Math.round((costPerConversionMicros / MICROS_PER_DOLLAR) * 100) / 100
          : 0,
      conversion_rate: Math.round(conversionRate * 100) / 100,
      impression_share: Math.round(impressionShare * 10000) / 100,
      budget_lost_share: Math.round(budgetLostShare * 10000) / 100,
      rank_lost_share: Math.round(rankLostShare * 10000) / 100,
      roas:
        costMicros > 0
          ? Math.round((conversionsValue / (costMicros / MICROS_PER_DOLLAR)) * 100) / 100
          : 0,
    }
    campaigns.push(campaignInfo)
  }

  const formattedRows = rawRows.map((row) => formatRow(row))
  const genericTotals = calculateGenericTotals(formattedRows)

  return {
    result,
    rows: formattedRows,
    campaigns,
    gaqlQuery,
    resource: detectResource(gaqlQuery, rawRows),
    accountTotals: {
      clicks: accountClicks,
      impressions: accountImpressions,
      cost: Math.round((accountCost / MICROS_PER_DOLLAR) * 100) / 100,
      conversions: accountConversions,
      conversions_value: Math.round(accountConversionsValue * 100) / 100,
    },
    genericTotals,
  }
}
