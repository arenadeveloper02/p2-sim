'use client'

import { dummyGTMData } from './dummy-data'
import { DollarSign, TrendingUp, TrendingDown, Users, Target } from 'lucide-react'

export function RevenueARRDashboard() {
  const data = dummyGTMData.revenueARR

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value}`
  }

  const formatPercentage = (value: number) => `${value}%`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <DollarSign className="h-6 w-6 text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-900">Revenue & ARR</h2>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">ARR</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(data.arr)}</p>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">{formatPercentage(data.arrGrowth)} growth</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-50 rounded-lg">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Net New ARR</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(data.netNewARR)}</p>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">{formatPercentage(data.netNewARRGrowth)} growth</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Target className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Net Retention</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{formatPercentage(data.netRetentionRate)}</p>
            <p className="text-sm text-gray-500">Retention Rate</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Users className="h-5 w-5 text-orange-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Churn Rate</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{formatPercentage(data.churnRate)}</p>
            <div className="flex items-center gap-1">
              <TrendingDown className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">{Math.abs(data.churnRateChange)}% improvement</span>
            </div>
          </div>
        </div>
      </div>

      {/* Growth & Profitability */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Growth Rate</h3>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-blue-600">{formatPercentage(data.growthRate)}</p>
              <p className="text-sm text-gray-500 mt-1">YoY Growth</p>
            </div>
            <div className="flex-1">
              <div className="w-full bg-blue-100 rounded-full h-4">
                <div 
                  className="bg-blue-600 h-4 rounded-full flex items-center justify-end pr-2"
                  style={{ width: `${Math.min(data.growthRate, 100)}%` }}
                >
                  <span className="text-xs text-white font-medium">{formatPercentage(data.growthRate)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Profitability</h3>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-green-600">{formatPercentage(data.profitabilityMargin)}</p>
              <p className="text-sm text-gray-500 mt-1">Profit Margin</p>
            </div>
            <div className="flex-1">
              <div className="w-full bg-green-100 rounded-full h-4">
                <div 
                  className="bg-green-600 h-4 rounded-full flex items-center justify-end pr-2"
                  style={{ width: `${Math.min(data.profitabilityMargin, 100)}%` }}
                >
                  <span className="text-xs text-white font-medium">{formatPercentage(data.profitabilityMargin)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600 font-medium">+{formatPercentage(data.profitabilityChange)} vs last quarter</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ARR by Segment */}
      <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">ARR by Segment</h3>
        <div className="space-y-4">
          {data.arrBySegment.map((segment, idx) => (
            <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  idx === 0 ? 'bg-blue-600' : idx === 1 ? 'bg-green-600' : 'bg-purple-600'
                }`} />
                <span className="font-medium text-gray-900">{segment.segment}</span>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">{formatCurrency(segment.arr)}</p>
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <span className="text-sm text-green-600">{formatPercentage(segment.growth)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly ARR Trend */}
      <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly ARR Growth</h3>
        <div className="h-64 flex items-end gap-2">
          {data.monthlyARR.map((item, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full space-y-1">
                <div 
                  className="w-full bg-blue-600 rounded-t hover:bg-blue-700 transition-colors cursor-pointer"
                  style={{ height: `${(item.arr / 25000000) * 200}px` }}
                  title={`ARR: ${formatCurrency(item.arr)}`}
                />
                <div 
                  className="w-full bg-green-500 rounded-b hover:bg-green-600 transition-colors cursor-pointer"
                  style={{ height: `${(item.netNew / 600000) * 50}px` }}
                  title={`Net New: ${formatCurrency(item.netNew)}`}
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
            <div className="w-3 h-3 bg-blue-600 rounded" />
            <span className="text-gray-600">Total ARR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded" />
            <span className="text-gray-600">Net New ARR</span>
          </div>
        </div>
      </div>
    </div>
  )
}
