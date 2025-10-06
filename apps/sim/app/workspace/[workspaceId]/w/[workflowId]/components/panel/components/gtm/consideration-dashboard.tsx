'use client'

import { dummyGTMData } from './dummy-data'
import { Zap } from 'lucide-react'

export function ConsiderationDashboard() {
  const data = dummyGTMData.consideration

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
    return value.toString()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Zap className="h-6 w-6 text-purple-500" />
        <h2 className="text-2xl font-bold">Consideration</h2>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Engaged Prospects</h3>
          <p className="text-4xl font-bold">{data.engagedProspects}</p>
        </div>

        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Paid Traffic</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold">{formatNumber(data.paidTraffic)}</p>
            <span className="text-sm text-red-600">{data.paidTrafficChange}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">by Month</p>
        </div>

        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Organic Traffic</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold">{formatNumber(data.organicTraffic)}</p>
            <span className="text-sm text-red-600">{data.organicTrafficChange}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">by Month</p>
        </div>

        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Known Traffic</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold">{formatNumber(data.knownTraffic)}</p>
            <span className="text-sm text-red-600">{data.knownTrafficChange}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">by Month</p>
        </div>
      </div>

      {/* Engagement Rates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Video Engagement Rate</h3>
          <p className="text-4xl font-bold">{data.videoEngagementRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">of users start a video</p>
        </div>

        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Form Engagement Rate</h3>
          <p className="text-4xl font-bold">{data.formEngagementRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">of users complete a form</p>
        </div>
      </div>

      {/* Marketing Funnel */}
      <div className="p-6 rounded-lg border bg-card">
        <h3 className="text-sm font-medium mb-4">Active Marketing Funnel</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="w-32 text-sm font-medium">Awareness</div>
            <div className="flex-1 bg-green-100 dark:bg-green-900/20 rounded-full h-8 relative overflow-hidden">
              <div 
                className="bg-green-500 h-full flex items-center justify-end pr-3 text-white text-sm font-medium"
                style={{ width: `${data.activeMarketingFunnel.awareness.percentage}%` }}
              >
                {data.activeMarketingFunnel.awareness.percentage}%
              </div>
            </div>
            <div className="w-24 text-sm text-right">{formatNumber(data.activeMarketingFunnel.awareness.prospects)}</div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-32 text-sm font-medium">Consideration</div>
            <div className="flex-1 bg-blue-100 dark:bg-blue-900/20 rounded-full h-8 relative overflow-hidden">
              <div 
                className="bg-blue-500 h-full flex items-center justify-end pr-3 text-white text-sm font-medium"
                style={{ width: `${data.activeMarketingFunnel.consideration.percentage}%` }}
              >
                {data.activeMarketingFunnel.consideration.percentage}%
              </div>
            </div>
            <div className="w-24 text-sm text-right">{formatNumber(data.activeMarketingFunnel.consideration.prospects)}</div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-32 text-sm font-medium">Conversion</div>
            <div className="flex-1 bg-purple-100 dark:bg-purple-900/20 rounded-full h-8 relative overflow-hidden">
              <div 
                className="bg-purple-500 h-full flex items-center justify-end pr-3 text-white text-sm font-medium"
                style={{ width: `${data.activeMarketingFunnel.conversion.percentage}%` }}
              >
                {data.activeMarketingFunnel.conversion.percentage}%
              </div>
            </div>
            <div className="w-24 text-sm text-right">{formatNumber(data.activeMarketingFunnel.conversion.prospects)}</div>
          </div>
        </div>
      </div>

      {/* Traffic by Channel */}
      <div className="p-6 rounded-lg border bg-card">
        <h3 className="text-sm font-medium mb-4">Traffic by Channel</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(data.trafficByChannel).map(([channel, percentage], idx) => (
            <div key={idx} className="text-center">
              <div className="mb-2">
                <div className="w-20 h-20 mx-auto rounded-full border-8 border-blue-500 flex items-center justify-center">
                  <span className="text-xl font-bold">{percentage}%</span>
                </div>
              </div>
              <p className="text-sm capitalize">{channel.replace(/([A-Z])/g, ' $1').trim()}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Visitor Rate by Page */}
      <div className="p-6 rounded-lg border bg-card">
        <h3 className="text-sm font-medium mb-4">Visitor Rate by Page</h3>
        <div className="space-y-3">
          {data.visitorRateByPage.map((item, idx) => (
            <div key={idx}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">{item.page}</span>
                <span className="text-sm font-medium">{item.rate}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-purple-500 h-2 rounded-full"
                  style={{ width: `${item.rate}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
