// GTM (Go-To-Market) Metrics Calculator
// Calculates CEO-level business metrics from Google Ads data

import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('GTMMetrics')

export interface GTMMetricsInput {
  accounts: Array<{
    account_id: string
    account_name: string
    spends: number
    conversions: number
    revenue?: number
    clicks?: number
    impressions?: number
  }>
  timeframe: {
    start: string
    end: string
    period: string // 'month', 'quarter', 'year'
  }
  previousPeriod?: {
    accounts: Array<{
      account_id: string
      account_name: string
      spends: number
      conversions: number
      revenue?: number
    }>
  }
}

export interface GTMMetricsOutput {
  // Revenue-Focused Metrics
  totalRevenue: number
  roas: number // Return on Ad Spend
  cac: number // Customer Acquisition Cost
  ltv?: number // Customer Lifetime Value (if available)
  cacToLtvRatio?: number

  // Growth Metrics
  momGrowth?: {
    revenue: number
    leads: number
    customers: number
  }
  yoyGrowth?: {
    revenue: number
    leads: number
    customers: number
  }

  // Efficiency Metrics
  cpl: number // Cost Per Lead
  conversionRate: number
  leadToCustomerRate?: number
  mqls?: number // Marketing Qualified Leads
  sqls?: number // Sales Qualified Leads

  // Profitability Metrics
  profitMargin?: number
  paybackPeriod?: number // Months to recover CAC
  mer: number // Marketing Efficiency Ratio (Revenue / Marketing Spend)

  // Strategic Metrics
  topPerformingAccounts: Array<{
    name: string
    roas: number
    revenue: number
    cpl: number
  }>
  atRiskAccounts: Array<{
    name: string
    reason: string
    roas: number
    cpl: number
  }>
  channelPerformance: Array<{
    channel: string
    revenue: number
    roas: number
    contribution: number // % of total revenue
  }>

  // Summary
  executiveSummary: string
}

/**
 * Calculate comprehensive GTM metrics from Google Ads data
 */
export function calculateGTMMetrics(input: GTMMetricsInput): GTMMetricsOutput {
  logger.info('Calculating GTM metrics', { 
    accountCount: input.accounts.length,
    timeframe: input.timeframe 
  })

  // Aggregate totals
  const totalSpends = input.accounts.reduce((sum, acc) => sum + acc.spends, 0)
  const totalConversions = input.accounts.reduce((sum, acc) => sum + acc.conversions, 0)
  const totalRevenue = input.accounts.reduce((sum, acc) => sum + (acc.revenue || 0), 0)
  const totalClicks = input.accounts.reduce((sum, acc) => sum + (acc.clicks || 0), 0)
  const totalImpressions = input.accounts.reduce((sum, acc) => sum + (acc.impressions || 0), 0)

  // Revenue-Focused Metrics
  const roas = totalRevenue > 0 ? totalRevenue / totalSpends : 0
  const cac = totalConversions > 0 ? totalSpends / totalConversions : 0
  const cpl = totalConversions > 0 ? totalSpends / totalConversions : 0

  // Efficiency Metrics
  const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0

  // Marketing Efficiency Ratio
  const mer = totalRevenue > 0 ? totalRevenue / totalSpends : 0

  // Calculate Growth Metrics (if previous period data available)
  let momGrowth
  if (input.previousPeriod) {
    const prevRevenue = input.previousPeriod.accounts.reduce((sum, acc) => sum + (acc.revenue || 0), 0)
    const prevLeads = input.previousPeriod.accounts.reduce((sum, acc) => sum + acc.conversions, 0)
    
    momGrowth = {
      revenue: prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0,
      leads: prevLeads > 0 ? ((totalConversions - prevLeads) / prevLeads) * 100 : 0,
      customers: 0 // Would need CRM data
    }
  }

  // Identify Top Performing Accounts
  const accountsWithMetrics = input.accounts.map(acc => ({
    name: acc.account_name,
    roas: acc.revenue && acc.spends > 0 ? acc.revenue / acc.spends : 0,
    revenue: acc.revenue || 0,
    cpl: acc.conversions > 0 ? acc.spends / acc.conversions : 0,
    spends: acc.spends,
    conversions: acc.conversions
  }))

  const topPerformingAccounts = accountsWithMetrics
    .filter(acc => acc.roas > 0)
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 5)
    .map(acc => ({
      name: acc.name,
      roas: acc.roas,
      revenue: acc.revenue,
      cpl: acc.cpl
    }))

  // Identify At-Risk Accounts
  const avgROAS = roas
  const avgCPL = cpl
  const atRiskAccounts = accountsWithMetrics
    .filter(acc => {
      const lowROAS = acc.roas > 0 && acc.roas < avgROAS * 0.5
      const highCPL = acc.cpl > avgCPL * 1.5
      return lowROAS || highCPL
    })
    .map(acc => ({
      name: acc.name,
      reason: acc.roas < avgROAS * 0.5 ? 'Low ROAS' : 'High CPL',
      roas: acc.roas,
      cpl: acc.cpl
    }))

  // Channel Performance (simplified - treating each account as a channel)
  const channelPerformance = accountsWithMetrics
    .filter(acc => acc.revenue > 0)
    .map(acc => ({
      channel: acc.name,
      revenue: acc.revenue,
      roas: acc.roas,
      contribution: totalRevenue > 0 ? (acc.revenue / totalRevenue) * 100 : 0
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // Generate Executive Summary
  const executiveSummary = generateExecutiveSummary({
    totalRevenue,
    roas,
    cac,
    cpl,
    mer,
    momGrowth,
    topPerformingAccounts,
    atRiskAccounts,
    totalSpends,
    totalConversions
  })

  return {
    totalRevenue,
    roas,
    cac,
    cpl,
    conversionRate,
    mer,
    momGrowth,
    topPerformingAccounts,
    atRiskAccounts,
    channelPerformance,
    executiveSummary
  }
}

/**
 * Generate executive summary text
 */
function generateExecutiveSummary(data: any): string {
  const {
    totalRevenue,
    roas,
    cac,
    cpl,
    mer,
    momGrowth,
    topPerformingAccounts,
    atRiskAccounts,
    totalSpends,
    totalConversions
  } = data

  let summary = `## Executive Summary\n\n`
  
  summary += `**Total Revenue Generated:** $${totalRevenue.toLocaleString()}\n`
  summary += `**Total Marketing Spend:** $${totalSpends.toLocaleString()}\n`
  summary += `**Total Leads Generated:** ${totalConversions.toLocaleString()}\n\n`
  
  summary += `### Key Performance Indicators\n`
  summary += `- **ROAS:** ${roas.toFixed(2)}x (${roas >= 4 ? '✅ Excellent' : roas >= 2 ? '⚠️ Fair' : '❌ Needs Improvement'})\n`
  summary += `- **Cost Per Lead:** $${cpl.toFixed(2)}\n`
  summary += `- **Customer Acquisition Cost:** $${cac.toFixed(2)}\n`
  summary += `- **Marketing Efficiency Ratio:** ${mer.toFixed(2)}x\n\n`

  if (momGrowth) {
    summary += `### Growth Trends\n`
    summary += `- **Revenue Growth (MoM):** ${momGrowth.revenue >= 0 ? '+' : ''}${momGrowth.revenue.toFixed(1)}%\n`
    summary += `- **Lead Growth (MoM):** ${momGrowth.leads >= 0 ? '+' : ''}${momGrowth.leads.toFixed(1)}%\n\n`
  }

  if (topPerformingAccounts.length > 0) {
    summary += `### Top Performing Accounts\n`
    topPerformingAccounts.slice(0, 3).forEach((acc: { name: string; roas: number; revenue: number }, i: number) => {
      summary += `${i + 1}. **${acc.name}** - ROAS: ${acc.roas.toFixed(2)}x, Revenue: $${acc.revenue.toLocaleString()}\n`
    })
    summary += `\n`
  }

  if (atRiskAccounts.length > 0) {
    summary += `### ⚠️ Accounts Requiring Attention\n`
    atRiskAccounts.slice(0, 3).forEach((acc: { name: string; reason: string; roas: number; cpl: number }) => {
      summary += `- **${acc.name}**: ${acc.reason} (ROAS: ${acc.roas.toFixed(2)}x, CPL: $${acc.cpl.toFixed(2)})\n`
    })
  }

  return summary
}

/**
 * Format GTM metrics for CEO presentation
 */
export function formatGTMMetricsForCEO(metrics: GTMMetricsOutput): string {
  let output = `# 📊 GTM Performance Report\n\n`
  
  output += metrics.executiveSummary + `\n\n`
  
  output += `---\n\n`
  output += `## 💰 Revenue & Profitability\n\n`
  output += `| Metric | Value | Status |\n`
  output += `|--------|-------|--------|\n`
  output += `| Total Revenue | $${metrics.totalRevenue.toLocaleString()} | - |\n`
  output += `| ROAS | ${metrics.roas.toFixed(2)}x | ${metrics.roas >= 4 ? '✅' : metrics.roas >= 2 ? '⚠️' : '❌'} |\n`
  output += `| Marketing Efficiency Ratio | ${metrics.mer.toFixed(2)}x | ${metrics.mer >= 3 ? '✅' : '⚠️'} |\n`
  output += `| Customer Acquisition Cost | $${metrics.cac.toFixed(2)} | - |\n\n`

  if (metrics.momGrowth) {
    output += `## 📈 Growth Metrics\n\n`
    output += `| Metric | Growth Rate |\n`
    output += `|--------|-------------|\n`
    output += `| Revenue (MoM) | ${metrics.momGrowth.revenue >= 0 ? '+' : ''}${metrics.momGrowth.revenue.toFixed(1)}% |\n`
    output += `| Leads (MoM) | ${metrics.momGrowth.leads >= 0 ? '+' : ''}${metrics.momGrowth.leads.toFixed(1)}% |\n\n`
  }

  output += `## 🎯 Efficiency Metrics\n\n`
  output += `| Metric | Value |\n`
  output += `|--------|-------|\n`
  output += `| Cost Per Lead | $${metrics.cpl.toFixed(2)} |\n`
  output += `| Conversion Rate | ${metrics.conversionRate.toFixed(2)}% |\n\n`

  if (metrics.channelPerformance.length > 0) {
    output += `## 📊 Channel Performance\n\n`
    output += `| Channel | Revenue | ROAS | Contribution |\n`
    output += `|---------|---------|------|-------------|\n`
    metrics.channelPerformance.slice(0, 10).forEach(channel => {
      output += `| ${channel.channel} | $${channel.revenue.toLocaleString()} | ${channel.roas.toFixed(2)}x | ${channel.contribution.toFixed(1)}% |\n`
    })
  }

  return output
}
