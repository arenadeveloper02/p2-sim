'use client'

import { dummyGTMData } from './dummy-data'
import { Target, TrendingUp, TrendingDown, Clock, Award, AlertTriangle } from 'lucide-react'

export function PipelineDealsDashboard() {
  const data = dummyGTMData.pipelineDeals

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
        <Target className="h-6 w-6 text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-900">Pipeline & Deals</h2>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Target className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Pipeline</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(data.pipelineGenerated)}</p>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">{formatPercentage(data.pipelineGrowth)} growth</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-50 rounded-lg">
              <Award className="h-5 w-5 text-green-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Win Rate</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{formatPercentage(data.winRate)}</p>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">+{formatPercentage(data.winRateChange)} vs last quarter</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Velocity</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{data.velocity} days</p>
            <div className="flex items-center gap-1">
              <TrendingDown className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">{Math.abs(data.velocityChange)} days faster</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-orange-50 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
            <span className="text-xs text-gray-500 font-medium">Deals Slipped</span>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-gray-900">{data.dealsSlipped}</p>
            <p className="text-sm text-orange-600 font-medium">{formatCurrency(data.dealsSlippedValue)} value</p>
          </div>
        </div>
      </div>

      {/* Deal Value & Account Scores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Average Deal Value</h3>
          <div className="text-center">
            <p className="text-5xl font-bold text-blue-600 mb-2">{formatCurrency(data.avgDealValue)}</p>
            <div className="flex items-center justify-center gap-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">+{formatPercentage(data.avgDealValueChange)} vs last quarter</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Scores</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">{data.accountScores.hot}</p>
              <p className="text-sm text-red-600 font-medium">Hot</p>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <p className="text-2xl font-bold text-yellow-600">{data.accountScores.warm}</p>
              <p className="text-sm text-yellow-600 font-medium">Warm</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{data.accountScores.cold}</p>
              <p className="text-sm text-blue-600 font-medium">Cold</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline by Source */}
      <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Pipeline by Source</h3>
        <div className="space-y-4">
          {data.pipelineBySource.map((source, idx) => (
            <div key={idx} className="flex items-center gap-4">
              <div className="w-24 text-sm font-medium text-gray-700">{source.source}</div>
              <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                <div 
                  className={`h-full flex items-center justify-end pr-3 text-white text-sm font-medium ${
                    idx === 0 ? 'bg-blue-600' : idx === 1 ? 'bg-green-600' : idx === 2 ? 'bg-purple-600' : 'bg-orange-600'
                  }`}
                  style={{ width: `${source.percentage}%` }}
                >
                  {formatPercentage(source.percentage)}
                </div>
              </div>
              <div className="w-24 text-right text-sm font-semibold text-gray-900">
                {formatCurrency(source.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deals by Stage */}
      <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Deals by Stage</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {data.dealsByStage.map((stage, idx) => (
            <div key={idx} className="text-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <p className="text-sm font-medium text-gray-600 mb-2">{stage.stage}</p>
              <p className="text-2xl font-bold text-gray-900 mb-1">{stage.count}</p>
              <p className="text-sm text-gray-500">{formatCurrency(stage.value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Win Rate by Deal Size */}
      <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Win Rate by Deal Size</h3>
        <div className="space-y-4">
          {data.winRateByDealSize.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900 w-20">{item.range}</span>
                <div className="w-48 bg-gray-200 rounded-full h-4">
                  <div 
                    className="bg-blue-600 h-4 rounded-full flex items-center justify-end pr-2"
                    style={{ width: `${item.winRate}%` }}
                  >
                    <span className="text-xs text-white font-medium">{formatPercentage(item.winRate)}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">{item.deals} deals</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
