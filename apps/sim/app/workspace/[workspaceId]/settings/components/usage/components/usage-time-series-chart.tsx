'use client'

import { useMemo } from 'react'
import {
  LineChart,
  type LineChartMultiSeries,
  type LineChartPoint,
} from '@/app/workspace/[workspaceId]/logs/components/dashboard/components'

interface UsageTimeSeriesPoint {
  bucketStart: string
  billableCost: number
  executionCount: number
  activeUserCount: number
}

interface UsageTimeSeriesChartProps {
  timeSeries: UsageTimeSeriesPoint[]
  /** Distinct human actors across the full selected period (not a sum of daily counts). */
  periodActiveUserCount?: number
}

/**
 * Cost / execution volume and active-user trends for the usage dashboard.
 *
 * LineChart uses `data` for the x-axis / hover timeline and early-returns
 * "No data" when it is empty — so billable cost is the primary series, with
 * executions overlaid via `series`. Active users sit on a separate chart
 * because LineChart shares a single Y-axis across series.
 */
export function UsageTimeSeriesChart({
  timeSeries,
  periodActiveUserCount,
}: UsageTimeSeriesChartProps) {
  const billableData = useMemo((): LineChartPoint[] => {
    return timeSeries.map((bucket) => ({
      timestamp: bucket.bucketStart,
      value: bucket.billableCost,
    }))
  }, [timeSeries])

  const series = useMemo((): LineChartMultiSeries[] => {
    if (timeSeries.length === 0) return []

    return [
      {
        id: 'executions',
        label: 'Executions',
        color: 'var(--brand-secondary)',
        data: timeSeries.map((bucket) => ({
          timestamp: bucket.bucketStart,
          value: bucket.executionCount,
        })),
        dashed: true,
      },
    ]
  }, [timeSeries])

  const activeUserData = useMemo((): LineChartPoint[] => {
    return timeSeries.map((bucket) => ({
      timestamp: bucket.bucketStart,
      value: bucket.activeUserCount,
    }))
  }, [timeSeries])

  if (timeSeries.length === 0) {
    return (
      <p className='py-6 text-center text-[var(--text-muted)] text-small'>
        No time-series data for this period.
      </p>
    )
  }

  const activeUserTotalLabel =
    periodActiveUserCount === undefined
      ? null
      : `${periodActiveUserCount.toLocaleString()} ${periodActiveUserCount === 1 ? 'user' : 'users'}`

  return (
    <div className='flex flex-col gap-4'>
      <div className='overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]'>
        <div className='flex flex-wrap items-center justify-between gap-2 border-[var(--border)] border-b bg-[var(--surface-3)] px-4 py-2'>
          <p className='font-medium text-[var(--text-primary)] text-small'>
            Cost & activity over time
          </p>
          <div className='flex items-center gap-3 text-[var(--text-muted)] text-micro'>
            <span className='inline-flex items-center gap-1.5'>
              <span
                aria-hidden='true'
                className='inline-block h-[2px] w-3 rounded-full bg-[var(--success)]'
              />
              Billable cost
            </span>
            <span className='inline-flex items-center gap-1.5'>
              <span
                aria-hidden='true'
                className='inline-block h-[2px] w-3 border-[var(--brand-secondary)] border-t border-dashed'
              />
              Executions
            </span>
          </div>
        </div>
        <div className='px-3.5 py-2.5'>
          <LineChart data={billableData} label='' color='var(--success)' series={series} />
        </div>
      </div>

      <div className='overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]'>
        <div className='flex flex-wrap items-center justify-between gap-2 border-[var(--border)] border-b bg-[var(--surface-3)] px-4 py-2'>
          <p className='font-medium text-[var(--text-primary)] text-small'>Active users over time</p>
          {activeUserTotalLabel && (
            <span className='text-[var(--text-muted)] text-micro'>{activeUserTotalLabel}</span>
          )}
        </div>
        <div className='px-3.5 py-2.5'>
          <LineChart data={activeUserData} label='' color='var(--brand-primary-hex, var(--brand-400))' />
        </div>
      </div>
    </div>
  )
}
