/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockLineChart } = vi.hoisted(() => ({
  mockLineChart: vi.fn(({ data }: { data: unknown[] }) => (
    <div data-testid='line-chart' data-points={String(data.length)} />
  )),
}))

vi.mock('@/app/workspace/[workspaceId]/logs/components/dashboard/components', () => ({
  LineChart: mockLineChart,
}))

import { UsageTimeSeriesChart } from '@/app/workspace/[workspaceId]/settings/components/usage/components/usage-time-series-chart'

function renderChart(ui: ReactNode): { container: HTMLDivElement; unmount: () => void } {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('UsageTimeSeriesChart', () => {
  afterEach(() => {
    mockLineChart.mockClear()
  })

  it('passes billable cost as LineChart primary data and renders active-users chart', () => {
    const timeSeries = [
      {
        bucketStart: '2026-07-01T00:00:00.000Z',
        billableCost: 1.25,
        executionCount: 3,
        activeUserCount: 2,
      },
      {
        bucketStart: '2026-07-02T00:00:00.000Z',
        billableCost: 2.5,
        executionCount: 5,
        activeUserCount: 1,
      },
    ]

    const { unmount, container } = renderChart(
      <UsageTimeSeriesChart timeSeries={timeSeries} periodActiveUserCount={3} />
    )

    expect(container.textContent).toContain('Cost & activity over time')
    expect(container.textContent).toContain('Credits')
    expect(container.textContent).toContain('Executions')
    expect(container.textContent).toContain('Active users over time')
    expect(container.textContent).toContain('3 users')
    expect(mockLineChart).toHaveBeenCalledTimes(2)

    const costProps = mockLineChart.mock.calls[0]?.[0] as {
      data: Array<{ timestamp: string; value: number }>
      series: Array<{ id: string; data: unknown[] }>
    }
    expect(costProps.data).toEqual([
      { timestamp: '2026-07-01T00:00:00.000Z', value: 250 },
      { timestamp: '2026-07-02T00:00:00.000Z', value: 500 },
    ])
    expect(costProps.series).toHaveLength(1)
    expect(costProps.series[0]?.id).toBe('executions')
    expect(costProps).toEqual(
      expect.objectContaining({
        label: '',
        color: 'var(--success)',
        unit: ' credits',
      })
    )

    const activeProps = mockLineChart.mock.calls[1]?.[0] as {
      data: Array<{ timestamp: string; value: number }>
    }
    expect(activeProps.data).toEqual([
      { timestamp: '2026-07-01T00:00:00.000Z', value: 2 },
      { timestamp: '2026-07-02T00:00:00.000Z', value: 1 },
    ])
    unmount()
  })

  it('shows empty copy when there are no buckets', () => {
    const { unmount, container } = renderChart(<UsageTimeSeriesChart timeSeries={[]} />)
    expect(container.textContent).toContain('No time-series data for this period.')
    expect(mockLineChart).not.toHaveBeenCalled()
    unmount()
  })
})
