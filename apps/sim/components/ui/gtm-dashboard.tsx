'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, DollarSign, Target, Users, Activity } from 'lucide-react'

interface GTMMetrics {
  totalRevenue: number
  roas: number
  cac: number
  cpl: number
  mer: number
  conversionRate: number
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
    contribution: number
  }>
  executiveSummary: string
}

interface GTMDashboardProps {
  data: {
    success: boolean
    output: string
    metrics?: GTMMetrics
  }
}

export function GTMDashboard({ data }: GTMDashboardProps) {
  if (!data.success || !data.metrics) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <p className="text-red-800 dark:text-red-200">Failed to load GTM metrics</p>
      </div>
    )
  }

  const metrics = data.metrics

  return (
    <div className="w-full space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">📊 GTM Performance Dashboard</h2>
          <p className="text-muted-foreground">Executive-level marketing metrics and insights</p>
        </div>
        <Badge variant={metrics.roas >= 4 ? 'default' : metrics.roas >= 2 ? 'secondary' : 'destructive'} className="text-lg px-4 py-2">
          {metrics.roas >= 4 ? '✅ Excellent' : metrics.roas >= 2 ? '⚠️ Fair' : '❌ Needs Attention'}
        </Badge>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Revenue"
          value={`$${metrics.totalRevenue.toLocaleString()}`}
          icon={<DollarSign className="h-4 w-4" />}
          trend={metrics.momGrowth ? metrics.momGrowth.revenue : undefined}
          status={metrics.totalRevenue > 0 ? 'success' : 'warning'}
        />
        <MetricCard
          title="ROAS"
          value={`${metrics.roas.toFixed(2)}x`}
          icon={<Target className="h-4 w-4" />}
          trend={undefined}
          status={metrics.roas >= 4 ? 'success' : metrics.roas >= 2 ? 'warning' : 'error'}
          subtitle={`Target: 4.0x+`}
        />
        <MetricCard
          title="Cost Per Lead"
          value={`$${metrics.cpl.toFixed(2)}`}
          icon={<Users className="h-4 w-4" />}
          trend={undefined}
          status="info"
        />
        <MetricCard
          title="Marketing Efficiency"
          value={`${metrics.mer.toFixed(2)}x`}
          icon={<Activity className="h-4 w-4" />}
          trend={undefined}
          status={metrics.mer >= 3 ? 'success' : 'warning'}
          subtitle="Revenue / Spend"
        />
      </div>

      {/* Growth Metrics */}
      {metrics.momGrowth && (
        <Card>
          <CardHeader>
            <CardTitle>📈 Growth Trends</CardTitle>
            <CardDescription>Month-over-month performance comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <GrowthMetric
                label="Revenue Growth"
                value={metrics.momGrowth.revenue}
                format="percentage"
              />
              <GrowthMetric
                label="Lead Growth"
                value={metrics.momGrowth.leads}
                format="percentage"
              />
              <GrowthMetric
                label="Customer Growth"
                value={metrics.momGrowth.customers}
                format="percentage"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Performers */}
      {metrics.topPerformingAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>🏆 Top Performing Accounts</CardTitle>
            <CardDescription>Ranked by ROAS and revenue contribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.topPerformingAccounts.slice(0, 5).map((account, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-600 text-white font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-semibold">{account.name}</p>
                      <p className="text-sm text-muted-foreground">
                        CPL: ${account.cpl.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600 dark:text-green-400">
                      {account.roas.toFixed(2)}x ROAS
                    </p>
                    <p className="text-sm text-muted-foreground">
                      ${account.revenue.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* At-Risk Accounts */}
      {metrics.atRiskAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              ⚠️ Accounts Requiring Attention
            </CardTitle>
            <CardDescription>Underperforming accounts that need optimization</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.atRiskAccounts.slice(0, 5).map((account, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
                >
                  <div>
                    <p className="font-semibold">{account.name}</p>
                    <p className="text-sm text-orange-600 dark:text-orange-400">
                      {account.reason}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-orange-600 dark:text-orange-400">
                      {account.roas.toFixed(2)}x ROAS
                    </p>
                    <p className="text-sm text-muted-foreground">
                      CPL: ${account.cpl.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Channel Performance */}
      {metrics.channelPerformance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>📊 Channel Performance</CardTitle>
            <CardDescription>Revenue contribution by channel</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.channelPerformance.slice(0, 10).map((channel, index) => (
                <div key={index} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{channel.channel}</span>
                    <span className="text-muted-foreground">
                      ${channel.revenue.toLocaleString()} ({channel.contribution.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(channel.contribution, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Insights */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            💡 AI-Powered Strategic Insights
          </CardTitle>
          <CardDescription>Recommendations based on performance data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <div className="space-y-4">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border">
                <h4 className="font-semibold mb-2">🎯 Budget Optimization</h4>
                <p className="text-sm text-muted-foreground">
                  {metrics.topPerformingAccounts.length > 0
                    ? `Increase investment in ${metrics.topPerformingAccounts[0].name} (${metrics.topPerformingAccounts[0].roas.toFixed(2)}x ROAS) for maximum ROI`
                    : 'Review account performance to identify optimization opportunities'}
                </p>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border">
                <h4 className="font-semibold mb-2">⚠️ Risk Mitigation</h4>
                <p className="text-sm text-muted-foreground">
                  {metrics.atRiskAccounts.length > 0
                    ? `Address underperformance in ${metrics.atRiskAccounts[0].name} - ${metrics.atRiskAccounts[0].reason}`
                    : 'All accounts performing within acceptable ranges'}
                </p>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border">
                <h4 className="font-semibold mb-2">📈 Growth Opportunities</h4>
                <p className="text-sm text-muted-foreground">
                  {metrics.momGrowth && metrics.momGrowth.revenue > 0
                    ? `Maintain momentum with ${metrics.momGrowth.revenue.toFixed(1)}% revenue growth`
                    : 'Focus on improving conversion rates and reducing CAC'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Helper Components

interface MetricCardProps {
  title: string
  value: string
  icon: React.ReactNode
  trend?: number
  status?: 'success' | 'warning' | 'error' | 'info'
  subtitle?: string
}

function MetricCard({ title, value, icon, trend, status = 'info', subtitle }: MetricCardProps) {
  const statusColors = {
    success: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20',
    warning: 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20',
    error: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20',
    info: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20',
  }

  return (
    <Card className={statusColors[status]}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {trend !== undefined && (
          <div className="flex items-center gap-1 mt-2">
            {trend >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
            <span className={`text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">vs last period</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface GrowthMetricProps {
  label: string
  value: number
  format: 'percentage' | 'number'
}

function GrowthMetric({ label, value, format }: GrowthMetricProps) {
  const isPositive = value >= 0
  const formattedValue = format === 'percentage' ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : value.toLocaleString()

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        {isPositive ? (
          <TrendingUp className="h-4 w-4 text-green-600" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-600" />
        )}
        <span className={`font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {formattedValue}
        </span>
      </div>
    </div>
  )
}
