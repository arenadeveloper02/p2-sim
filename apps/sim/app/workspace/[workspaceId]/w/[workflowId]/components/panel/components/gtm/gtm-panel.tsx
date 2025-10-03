'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { GTMDashboard } from '@/components/ui/gtm-dashboard'
import { createLogger } from '@/lib/logs/console/logger'
import { RefreshCw, Calendar } from 'lucide-react'
import { GOOGLE_ADS_ACCOUNTS } from '@/app/api/google-ads/helpers/utils'

const logger = createLogger('GTMPanel')

interface GTMMetrics {
  totalRevenue: number
  roas: number
  cac: number
  cpl: number
  conversionRate: number
  mer: number
  momGrowth?: {
    revenue: number
    leads: number
    customers: number
  }
  topPerformingAccounts: any[]
  atRiskAccounts: any[]
  channelPerformance: any[]
  executiveSummary: string
}

interface GTMPanelProps {
  workflowId: string
}

export function GTMPanel({ workflowId }: GTMPanelProps) {
  const [gtmData, setGtmData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState('last_7_days')
  const [accounts, setAccounts] = useState('all')

  const fetchGTMMetrics = async () => {
    setLoading(true)
    setError(null)
    
    try {
      logger.info('Fetching GTM metrics', { timeframe, accounts })
      
      const response = await fetch('/api/ceo-metrics/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `Show me our marketing ROI across all accounts for the ${timeframe.replace('_', ' ')}`,
          timeframe,
          accounts,
          includeComparison: 'previous',
          focusMetrics: 'all',
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      logger.info('GTM metrics received', { data })
      
      if (data.success) {
        setGtmData(data)
      } else {
        setError(data.error || 'Failed to fetch GTM metrics')
      }
    } catch (err) {
      logger.error('Failed to fetch GTM metrics', { err })
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Auto-fetch on mount
    fetchGTMMetrics()
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Header with controls */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">📊 GTM Metrics Dashboard</h2>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Timeframe selector */}
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="last_7_days">Last 7 Days</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="last_quarter">Last Quarter</option>
            </select>

            {/* Accounts selector */}
            <select
              value={accounts}
              onChange={(e) => setAccounts(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="all">All Accounts</option>
              {Object.entries(GOOGLE_ADS_ACCOUNTS).map(([key, account]) => (
                <option key={key} value={key}>
                  {account.name}
                </option>
              ))}
            </select>

            {/* Refresh button */}
            <Button
              onClick={fetchGTMMetrics}
              disabled={loading}
              size="sm"
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Dashboard content */}
      <div className="flex-1 overflow-auto p-4">
        {loading && !gtmData && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <RefreshCw className="mx-auto h-8 w-8 animate-spin text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">Loading GTM metrics...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-600">Error: {error}</p>
            <Button onClick={fetchGTMMetrics} size="sm" className="mt-2">
              Retry
            </Button>
          </div>
        )}

        {gtmData && !loading && (
          <GTMDashboard data={gtmData} />
        )}

        {!gtmData && !loading && !error && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Calendar className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-4 text-sm text-gray-500">
                Select timeframe and click refresh to view GTM metrics
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
