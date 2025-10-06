'use client'

import { dummyGTMData } from './dummy-data'
import { TrendingUp } from 'lucide-react'

export function ConversionDashboard() {
  const data = dummyGTMData.conversion

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TrendingUp className="h-6 w-6 text-blue-500" />
        <h2 className="text-2xl font-bold">Conversion</h2>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Wins</h3>
          <p className="text-4xl font-bold">{data.wins}</p>
        </div>

        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Spend</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold">{formatCurrency(data.spendByMonth[data.spendByMonth.length - 1].spend)}</p>
            <span className="text-sm text-green-600">+5.4%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">by Month</p>
        </div>

        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Time To Close</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold">{data.timeToClose}</p>
            <span className="text-sm text-green-600">{data.timeToCloseChange}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">days</p>
        </div>

        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Avg Deal Size</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold">{formatCurrency(data.avgDealSize)}</p>
            <span className="text-sm text-red-600">{data.avgDealSizeChange}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">by Month</p>
        </div>
      </div>

      {/* Channel Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium mb-4">Revenue by Channel</h3>
          <div className="space-y-3">
            {data.revenueByChannel.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm">{item.channel}</span>
                <span className="text-sm font-medium">{formatCurrency(item.revenue)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium mb-4">Spend by Channel</h3>
          <div className="space-y-3">
            {data.spendByChannel.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm">{item.channel}</span>
                <span className="text-sm font-medium">{formatCurrency(item.spend)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium mb-4">ROI by Channel</h3>
          <div className="space-y-3">
            {data.roiByChannel.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm">{item.channel}</span>
                <span className="text-sm font-medium text-green-600">{item.roi}x</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ACV by Quarter */}
      <div className="p-6 rounded-lg border bg-card">
        <h3 className="text-sm font-medium mb-4">ACV by Quarter</h3>
        <div className="h-64 flex items-end gap-4">
          {data.acvByQuarter.map((item, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full space-y-1">
                <div 
                  className="w-full bg-blue-500 rounded-t"
                  style={{ height: `${(item.acv / 150000000) * 200}px` }}
                  title={`ACV: ${formatCurrency(item.acv)}`}
                />
                <div 
                  className="w-full bg-green-500"
                  style={{ height: `${(item.paidSearch / 150000000) * 200}px` }}
                  title={`Paid Search: ${formatCurrency(item.paidSearch)}`}
                />
                <div 
                  className="w-full bg-purple-500"
                  style={{ height: `${(item.paidSocial / 150000000) * 200}px` }}
                  title={`Paid Social: ${formatCurrency(item.paidSocial)}`}
                />
                <div 
                  className="w-full bg-orange-500"
                  style={{ height: `${(item.organic / 150000000) * 200}px` }}
                  title={`Organic: ${formatCurrency(item.organic)}`}
                />
              </div>
              <span className="text-xs text-muted-foreground">{item.quarter}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded" />
            <span>ACV</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded" />
            <span>Paid Search</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-purple-500 rounded" />
            <span>Paid Social</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500 rounded" />
            <span>Organic</span>
          </div>
        </div>
      </div>

      {/* Spend by Month Chart */}
      <div className="p-6 rounded-lg border bg-card">
        <h3 className="text-sm font-medium mb-4">Spend by Month</h3>
        <div className="h-48 flex items-end gap-2">
          {data.spendByMonth.map((item, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
              <div 
                className="w-full bg-blue-500 rounded-t"
                style={{ height: `${(item.spend / 10000000) * 150}px` }}
              />
              <span className="text-xs text-muted-foreground transform -rotate-45 origin-top-left mt-2">
                {item.month.split('-')[1]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
