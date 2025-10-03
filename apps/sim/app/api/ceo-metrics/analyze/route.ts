import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { calculateGTMMetrics, formatGTMMetricsForCEO } from '@/app/api/google-ads/helpers/gtm-metrics'
import type { GTMMetricsInput } from '@/app/api/google-ads/helpers/gtm-metrics'

const logger = createLogger('CEOMetricsAnalyzeAPI')

/**
 * POST /api/ceo-metrics/analyze
 * Analyzes Google Ads data and returns CEO-level GTM metrics
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      question,
      timeframe,
      accounts,
      customStartDate,
      customEndDate,
      includeComparison,
      focusMetrics,
    } = body

    logger.info('🚀 CEO METRICS API CALLED!', {
      question,
      timeframe,
      accounts,
      url: request.url,
      method: request.method
    })

    // Step 1: Determine date range
    const dateRange = getDateRange(timeframe, customStartDate, customEndDate)
    logger.info('Date range calculated', { dateRange })

    // Step 2: Fetch Google Ads data for all accounts
    const googleAdsData = await fetchGoogleAdsData(dateRange, accounts)
    logger.info('Google Ads data fetched', {
      accountCount: googleAdsData.accounts.length,
      totalSpends: googleAdsData.accounts.reduce((sum, acc) => sum + acc.spends, 0),
    })

    // Step 3: Get comparison data if requested
    let comparisonData = null
    if (includeComparison && includeComparison !== 'none') {
      const comparisonRange = getComparisonDateRange(dateRange, includeComparison)
      comparisonData = await fetchGoogleAdsData(comparisonRange, accounts)
      logger.info('Comparison data fetched', { comparisonRange })
    }

    // Step 4: Calculate GTM metrics
    const gtmInput: GTMMetricsInput = {
      accounts: googleAdsData.accounts,
      timeframe: {
        start: dateRange.start,
        end: dateRange.end,
        period: timeframe || 'custom'
      },
      previousPeriod: comparisonData ? {
        accounts: comparisonData.accounts
      } : undefined,
    }

    const gtmMetrics = calculateGTMMetrics(gtmInput)
    logger.info('GTM metrics calculated', {
      totalRevenue: gtmMetrics.totalRevenue,
      roas: gtmMetrics.roas,
      totalAccounts: gtmMetrics.topPerformingAccounts.length + gtmMetrics.atRiskAccounts.length,
    })

    // Step 5: Format for CEO presentation
    const formattedReport = formatGTMMetricsForCEO(gtmMetrics)

    // Step 6: Generate AI insights (simplified for now)
    const aiInsights = `## 🤖 AI-Powered Insights

Based on the data analysis, here are key insights and recommendations:

### Strategic Recommendations

1. **Budget Optimization**: ${gtmMetrics.topPerformingAccounts.length > 0 ? 
  `Increase investment in ${gtmMetrics.topPerformingAccounts[0].name} (${gtmMetrics.topPerformingAccounts[0].roas.toFixed(2)}x ROAS)` : 
  'Review account performance to identify optimization opportunities'}

2. **Risk Mitigation**: ${gtmMetrics.atRiskAccounts.length > 0 ? 
  `Address underperformance in ${gtmMetrics.atRiskAccounts[0].name} - ${gtmMetrics.atRiskAccounts[0].reason}` : 
  'All accounts performing within acceptable ranges'}

3. **Growth Opportunities**: ${gtmMetrics.momGrowth && gtmMetrics.momGrowth.revenue > 0 ? 
  `Maintain momentum with ${gtmMetrics.momGrowth.revenue.toFixed(1)}% revenue growth` : 
  'Focus on improving conversion rates and reducing CAC'}

### Next Steps

- Review top performing campaigns for scaling opportunities
- Optimize or pause underperforming accounts
- Test new strategies in high-ROAS accounts
- Monitor CAC trends and adjust bidding strategies

*This analysis is based on Google Ads performance data and GTM metrics calculations.*`

    // Step 7: Combine formatted report with AI insights
    const finalOutput = `${formattedReport}\n\n---\n\n${aiInsights}`

    logger.info('🎉 CEO Metrics Analysis completed successfully')

    const response = {
      success: true,
      output: finalOutput,
      metrics: gtmMetrics,
    }

    logger.info('🔍 CEO API Response Structure:', {
      hasSuccess: !!response.success,
      hasOutput: !!response.output,
      hasMetrics: !!response.metrics,
      metricsKeys: response.metrics ? Object.keys(response.metrics) : 'no metrics',
      outputLength: response.output?.length || 0
    })

    return NextResponse.json(response)
  } catch (error) {
    logger.error('CEO Metrics Analysis failed', { error })

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

/**
 * Get date range based on timeframe selection
 */
function getDateRange(
  timeframe: string,
  customStart?: string,
  customEnd?: string
): { start: string; end: string } {
  const today = new Date()
  const formatDate = (date: Date) => date.toISOString().split('T')[0]

  if (timeframe === 'custom' && customStart && customEnd) {
    return { start: customStart, end: customEnd }
  }

  switch (timeframe) {
    case 'last_7_days': {
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      return { start: formatDate(weekAgo), end: formatDate(today) }
    }

    case 'last_30_days': {
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      return { start: formatDate(monthAgo), end: formatDate(today) }
    }

    case 'this_month': {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      return { start: formatDate(monthStart), end: formatDate(today) }
    }

    case 'last_month': {
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      return { start: formatDate(lastMonthStart), end: formatDate(lastMonthEnd) }
    }

    case 'this_quarter': {
      const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)
      return { start: formatDate(quarterStart), end: formatDate(today) }
    }

    case 'last_quarter': {
      const lastQuarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 - 3, 1)
      const lastQuarterEnd = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 0)
      return { start: formatDate(lastQuarterStart), end: formatDate(lastQuarterEnd) }
    }

    case 'this_year': {
      const yearStart = new Date(today.getFullYear(), 0, 1)
      return { start: formatDate(yearStart), end: formatDate(today) }
    }

    case 'last_year': {
      const lastYearStart = new Date(today.getFullYear() - 1, 0, 1)
      const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31)
      return { start: formatDate(lastYearStart), end: formatDate(lastYearEnd) }
    }

    default: {
      const defaultMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      return { start: formatDate(defaultMonthAgo), end: formatDate(today) }
    }
  }
}

/**
 * Get comparison date range
 */
function getComparisonDateRange(
  currentRange: { start: string; end: string },
  comparisonType: string
): { start: string; end: string } {
  const start = new Date(currentRange.start)
  const end = new Date(currentRange.end)
  const duration = end.getTime() - start.getTime()

  if (comparisonType === 'yoy') {
    // Same period last year
    const prevStart = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate())
    const prevEnd = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate())
    return {
      start: prevStart.toISOString().split('T')[0],
      end: prevEnd.toISOString().split('T')[0]
    }
  }

  // Previous period (same duration)
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000)
  const prevStart = new Date(prevEnd.getTime() - duration)
  return {
    start: prevStart.toISOString().split('T')[0],
    end: prevEnd.toISOString().split('T')[0]
  }
}

/**
 * Fetch Google Ads data for specified accounts and date range
 */
async function fetchGoogleAdsData(
  dateRange: { start: string; end: string },
  accountsFilter: string
): Promise<{ accounts: Array<any> }> {
  logger.info('Fetching Google Ads data', { dateRange, accountsFilter })

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/google-ads/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `Show me performance data for all accounts from ${dateRange.start} to ${dateRange.end}`,
        accounts: accountsFilter === 'all' ? 'ami' : accountsFilter,
        period_type: 'custom',
        custom_start_date: dateRange.start,
        custom_end_date: dateRange.end,
      }),
    })

    const data = await response.json()
    
    logger.info('Google Ads API response structure', { 
      hasResults: !!data.results,
      hasGrandTotals: !!data.grand_totals,
      dataKeys: Object.keys(data)
    })

    // Handle different response formats
    let accounts: Array<any> = []

    // Format 1: Array of account results
    if (data.results && Array.isArray(data.results)) {
      accounts = data.results.map((result: any) => ({
        account_id: result.account_id || 'unknown',
        account_name: result.account_name || 'Unknown Account',
        spends: result.account_totals?.cost || 0,
        conversions: result.account_totals?.conversions || 0,
        revenue: result.account_totals?.conversions_value || 0,
        clicks: result.account_totals?.clicks || 0,
        impressions: result.account_totals?.impressions || 0,
      }))
    }
    // Format 2: Single account with grand_totals
    else if (data.grand_totals) {
      accounts = [{
        account_id: accountsFilter,
        account_name: accountsFilter.toUpperCase(),
        spends: data.grand_totals.cost || 0,
        conversions: data.grand_totals.conversions || 0,
        revenue: data.grand_totals.conversions_value || 0,
        clicks: data.grand_totals.clicks || 0,
        impressions: data.grand_totals.impressions || 0,
      }]
    }
    // Format 3: Direct metrics (fallback)
    else if (data.cost !== undefined) {
      accounts = [{
        account_id: accountsFilter,
        account_name: accountsFilter.toUpperCase(),
        spends: data.cost || 0,
        conversions: data.conversions || 0,
        revenue: data.conversions_value || 0,
        clicks: data.clicks || 0,
        impressions: data.impressions || 0,
      }]
    }

    logger.info('Transformed accounts data', { 
      accountCount: accounts.length,
      totalSpends: accounts.reduce((sum, acc) => sum + acc.spends, 0)
    })

    return { accounts }
  } catch (error) {
    logger.error('Failed to fetch Google Ads data', { error })
    throw error
  }
}
