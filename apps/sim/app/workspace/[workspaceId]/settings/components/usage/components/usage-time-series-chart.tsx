'use client'

import { useMemo } from 'react'
import type { WorkspaceUsageAnalytics } from '@/lib/api/contracts/workspace-usage'
import {
  LineChart,
  type LineChartMultiSeries,
} from '@/app/workspace/[workspaceId]/logs/components/dashboard/components'

interface UsageTimeSeriesChartProps {
  timeSeries: WorkspaceUsageAnalytics['timeSeries']
}

/**
 * Cost and execution volume over time for the usage dashboard.
 */
export function UsageTimeSeriesChart({ timeSeries }: UsageTimeSeriesChartProps) {
  const series = useMemo((): LineChartMultiSeries[] => {
    if (timeSeries.length === 0) return []

    return [
      {
        id: 'billable-cost',
        label: 'Billable cost',
        color: 'var(--success)',
        data: timeSeries.map((bucket) => ({
          timestamp: bucket.bucketStart,
          value: bucket.billableCost,
        })),
      },
      {
        id: 'executions',
        label: 'Executions',
        color: 'var(--info)',
        data: timeSeries.map((bucket) => ({
          timestamp: bucket.bucketStart,
          value: bucket.executionCount,
        })),
        dashed: true,
      },
    ]
  }, [timeSeries])

  if (timeSeries.length === 0) {
    return (
      <p className='py-6 text-center text-[var(--text-muted)] text-small'>
        No time-series data for this period.
      </p>
    )
  }

  return (
    <div className='overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]'>
      <div className='border-[var(--border)] border-b bg-[var(--surface-3)] px-4 py-2'>
        <p className='font-medium text-[var(--text-primary)] text-small'>Cost & activity over time</p>
      </div>
      <div className='px-3.5 py-2.5'>
        <LineChart data={[]} label='' color='var(--success)' series={series} />
      </div>
    </div>
  )
}
