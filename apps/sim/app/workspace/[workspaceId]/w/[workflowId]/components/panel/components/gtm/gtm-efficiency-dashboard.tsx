'use client'

import { dummyGTMData } from './dummy-data'
import { Zap, TrendingUp, TrendingDown, Users, Clock, DollarSign } from 'lucide-react'

export function GTMEfficiencyDashboard() {
  const data = dummyGTMData.gtmEfficiency

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value}`
  }

  const formatDecimal = (value: number) => `$${value.toFixed(2)}`
  const formatRatio = (value: number) => `${value.toFixed(1)}x`
  const formatPercentage = (value: number) => `${value}%`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Zap className="h-6 w-6 text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-900">GTM Efficiency</h2>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">GTM Expense/ARR</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{formatDecimal(data.gtmExpensePerARR)}</p>
            <div className="flex items-center gap-1">
              <TrendingDown className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">{formatDecimal(Math.abs(data.gtmExpensePerARRChange))} improvement</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-50 rounded-lg">
              <Zap className="h-5 w-5 text-green-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">GTM Efficiency</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{formatRatio(data.gtmEfficiencyRatio)}</p>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">+{formatRatio(data.gtmEfficiencyChange)} vs last quarter</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">CAC Payback</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{data.cacPaybackPeriod} mo</p>
            <div className="flex items-center gap-1">
              <TrendingDown className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">{Math.abs(data.cacPaybackChange)} months faster</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-orange-50 rounded-lg">
              <TrendingUp className="h-5 w-5 text-orange-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">LTV/CAC</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{formatRatio(data.ltvCacRatio)}</p>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">+{formatRatio(data.ltvCacChange)} improvement</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sales Cycle & Team Efficiency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Sales Cycle Length</h3>
          <div className="text-center">
            <p className="text-5xl font-bold text-blue-600 mb-2">{data.salesCycleLength} days</p>
            <div className="flex items-center justify-center gap-1">
              <TrendingDown className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">{Math.abs(data.salesCycleChange)} days faster than last quarter</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">GTM Team Efficiency</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{data.gtmTeamEfficiency.salesReps}</p>
              <p className="text-sm text-blue-600 font-medium">Sales Reps</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{data.gtmTeamEfficiency.avgDealsPerRep}</p>
              <p className="text-sm text-green-600 font-medium">Deals/Rep</p>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <p className="text-xl font-bold text-purple-600">{formatCurrency(data.gtmTeamEfficiency.avgRevenuePerRep)}</p>
              <p className="text-sm text-purple-600 font-medium">Revenue/Rep</p>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <p className="text-2xl font-bold text-orange-600">{data.gtmTeamEfficiency.marketingMQLs}</p>
              <p className="text-sm text-orange-600 font-medium">MQLs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Conversion Rates */}
      <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversion Rates</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">MQL to SQL Rate</span>
                <span className="text-sm font-bold text-gray-900">{formatPercentage(data.gtmTeamEfficiency.mqLtoSQLRate)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-blue-600 h-3 rounded-full"
                  style={{ width: `${data.gtmTeamEfficiency.mqLtoSQLRate}%` }}
                />
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">SQL to Closed Rate</span>
                <span className="text-sm font-bold text-gray-900">{formatPercentage(data.gtmTeamEfficiency.sqlToClosedRate)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-green-600 h-3 rounded-full"
                  style={{ width: `${data.gtmTeamEfficiency.sqlToClosedRate}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GTM Spend Breakdown */}
      <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">GTM Spend Breakdown</h3>
        <div className="space-y-4">
          {data.gtmSpendBreakdown.map((item, idx) => (
            <div key={idx} className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium text-gray-700">{item.category}</div>
              <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                <div 
                  className={`h-full flex items-center justify-end pr-3 text-white text-sm font-medium ${
                    idx === 0 ? 'bg-blue-600' : idx === 1 ? 'bg-green-600' : idx === 2 ? 'bg-purple-600' : 'bg-orange-600'
                  }`}
                  style={{ width: `${item.percentage}%` }}
                >
                  {formatPercentage(item.percentage)}
                </div>
              </div>
              <div className="w-24 text-right text-sm font-semibold text-gray-900">
                {formatCurrency(item.spend)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Efficiency Trends */}
      <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">LTV/CAC Efficiency Trends</h3>
        <div className="h-64 flex items-end gap-2">
          {data.efficiencyTrends.map((item, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full space-y-1">
                <div 
                  className="w-full bg-green-600 rounded-t hover:bg-green-700 transition-colors cursor-pointer"
                  style={{ height: `${(item.ltv / 20000) * 150}px` }}
                  title={`LTV: ${formatCurrency(item.ltv)}`}
                />
                <div 
                  className="w-full bg-red-500 rounded-b hover:bg-red-600 transition-colors cursor-pointer"
                  style={{ height: `${(item.cac / 5000) * 100}px` }}
                  title={`CAC: ${formatCurrency(item.cac)}`}
                />
              </div>
              <span className="text-xs text-gray-500 transform -rotate-45 origin-top-left mt-2">
                {item.month.split('-')[1]}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-600 rounded" />
            <span className="text-gray-600">LTV</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded" />
            <span className="text-gray-600">CAC</span>
          </div>
        </div>
      </div>
    </div>
  )
}
