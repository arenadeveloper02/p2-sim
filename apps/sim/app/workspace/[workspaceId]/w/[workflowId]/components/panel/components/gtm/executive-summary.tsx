'use client'

import { dummyGTMData } from './dummy-data'
import { DollarSign, Target, Users, TrendingUp, Award } from 'lucide-react'

export function ExecutiveSummary() {
  const data = dummyGTMData

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value}`
  }

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
    return value.toString()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Award className="h-6 w-6 text-blue-500" />
        <h2 className="text-2xl font-bold">Executive Summary</h2>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-6 rounded-lg border bg-card hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-xs text-muted-foreground">Spend</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{formatCurrency(data.executiveSummary.totalSpend)}</p>
            <p className="text-sm text-muted-foreground">Total Investment</p>
          </div>
        </div>

        <div className="p-6 rounded-lg border bg-card hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <Target className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-xs text-muted-foreground">CTR</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{data.executiveSummary.ctr}%</p>
            <p className="text-sm text-muted-foreground">Click-Through Rate</p>
          </div>
        </div>

        <div className="p-6 rounded-lg border bg-card hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-xs text-muted-foreground">Interactions</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{formatNumber(data.executiveSummary.interactions)}</p>
            <p className="text-sm text-muted-foreground">Total Engagements</p>
          </div>
        </div>

        <div className="p-6 rounded-lg border bg-card hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
              <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <span className="text-xs text-muted-foreground">ACV</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">{formatCurrency(data.executiveSummary.acv)}</p>
            <p className="text-sm text-muted-foreground">Annual Contract Value</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Goal: {formatCurrency(data.executiveSummary.atvGoal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Spend Budget vs Actual */}
      <div className="p-6 rounded-lg border bg-card">
        <h3 className="text-lg font-semibold mb-4">Spend - Budget vs Actual by Month</h3>
        <div className="text-sm font-medium mb-4">
          {formatCurrency(data.spendBudgetVsActual[data.spendBudgetVsActual.length - 1].actual)} Budgeted Spend
        </div>
        <div className="h-64 flex items-end gap-2">
          {data.spendBudgetVsActual.map((item, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col gap-1">
                <div 
                  className="w-full bg-blue-500 rounded-t"
                  style={{ height: `${(item.actual / 10000000) * 200}px` }}
                />
                <div 
                  className="w-full bg-orange-500"
                  style={{ height: `${(item.budget / 10000000) * 200}px` }}
                />
              </div>
              <span className="text-xs text-muted-foreground transform -rotate-45 origin-top-left mt-2">
                {item.month.split('-')[1]}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded" />
            <span>Actual</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500 rounded" />
            <span>Budget</span>
          </div>
        </div>
      </div>
    </div>
  )
}
