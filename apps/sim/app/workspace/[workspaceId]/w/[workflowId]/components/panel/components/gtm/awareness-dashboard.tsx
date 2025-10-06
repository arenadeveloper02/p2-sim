'use client'

import { dummyGTMData } from './dummy-data'
import { Activity, TrendingDown, TrendingUp } from 'lucide-react'

export function AwarenessDashboard() {
  const data = dummyGTMData.awareness

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity className="h-6 w-6 text-green-500" />
        <h2 className="text-2xl font-bold">Awareness</h2>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Active Campaigns</h3>
          <p className="text-4xl font-bold">{data.activeCampaigns}</p>
          <p className="text-xs text-muted-foreground mt-1">Click to see list of Campaigns</p>
        </div>

        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">CPM by Month</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-bold">${data.cpm}</p>
            <span className={`text-sm flex items-center ${data.cpmChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
              {data.cpmChange < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              {Math.abs(data.cpmChange)}%
            </span>
          </div>
        </div>

        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">CPC</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-bold">${data.cpc}</p>
            <span className={`text-sm flex items-center ${data.cpcChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
              {data.cpcChange < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              {Math.abs(data.cpcChange)}%
            </span>
          </div>
        </div>

        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">CPA</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-bold">${data.cpa}</p>
            <span className={`text-sm flex items-center ${data.cpaChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
              {data.cpaChange < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              {Math.abs(data.cpaChange)}%
            </span>
          </div>
        </div>
      </div>

      {/* Campaign Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium mb-4">Top Branded Campaigns</h3>
          <div className="text-xs text-muted-foreground mb-2">
            Average CTR: {data.brandedCTR}% | Top: {data.topBrandedCampaign} ({data.topBrandedCTR}%)
          </div>
          <div className="space-y-2">
            {data.topBrandedCampaigns.map((campaign, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded hover:bg-accent">
                <span className="text-sm">{campaign.name}</span>
                <span className="text-sm font-medium text-green-600">{campaign.ctr}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 rounded-lg border bg-card">
          <h3 className="text-sm font-medium mb-4">Top Non-Branded Campaigns</h3>
          <div className="text-xs text-muted-foreground mb-2">
            Average CTR: {data.nonBrandedCTR}% | Top: {data.topNonBrandedCampaign} ({data.topNonBrandedCTR}%)
          </div>
          <div className="space-y-2">
            {data.topNonBrandedCampaigns.map((campaign, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded hover:bg-accent">
                <span className="text-sm">{campaign.name}</span>
                <span className="text-sm font-medium text-green-600">{campaign.ctr}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Impressions by Vendor */}
      <div className="p-6 rounded-lg border bg-card">
        <h3 className="text-sm font-medium mb-4">Impressions by Vendor</h3>
        <div className="space-y-3">
          {Object.entries(data.impressionsByVendor).map(([vendor, impressions], idx) => {
            const total = Object.values(data.impressionsByVendor).reduce((a, b) => a + b, 0)
            const percentage = ((impressions / total) * 100).toFixed(1)
            return (
              <div key={idx}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm capitalize">{vendor}</span>
                  <span className="text-sm font-medium">{percentage}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top Keywords */}
      <div className="p-6 rounded-lg border bg-card">
        <h3 className="text-sm font-medium mb-4">Top Non-Branded Keywords</h3>
        <div className="flex flex-wrap gap-2">
          {data.topNonBrandedKeywords.map((keyword, idx) => (
            <span 
              key={idx} 
              className="px-3 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-sm"
            >
              {keyword}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
