/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  densifyTimeSeries,
  EMPTY_USAGE_METRICS,
  truncateToBucketStart,
} from '@/lib/workspaces/usage/ledger-helpers'

describe('densifyTimeSeries', () => {
  it('fills zero buckets across a daily period window', () => {
    const densified = densifyTimeSeries(
      [
        {
          bucketStart: '2026-07-02T00:00:00.000Z',
          billableCost: 1.25,
          rawCost: 1.25,
          executionCount: 3,
          activeUserCount: 2,
          usage: { ...EMPTY_USAGE_METRICS, invocationCount: 3 },
        },
      ],
      {
        start: new Date('2026-07-01T08:00:00.000Z'),
        end: new Date('2026-07-04T12:00:00.000Z'),
      },
      false
    )

    expect(densified.map((bucket) => bucket.bucketStart)).toEqual([
      '2026-07-01T00:00:00.000Z',
      '2026-07-02T00:00:00.000Z',
      '2026-07-03T00:00:00.000Z',
      '2026-07-04T00:00:00.000Z',
    ])
    expect(densified[1]).toEqual(
      expect.objectContaining({
        billableCost: 1.25,
        executionCount: 3,
        activeUserCount: 2,
      })
    )
    expect(densified[0]).toEqual(
      expect.objectContaining({
        billableCost: 0,
        executionCount: 0,
        activeUserCount: 0,
      })
    )
  })

  it('fills hourly buckets for a 1d window', () => {
    const densified = densifyTimeSeries(
      [
        {
          bucketStart: '2026-07-01T10:00:00.000Z',
          billableCost: 0.5,
          rawCost: 0.5,
          executionCount: 1,
          activeUserCount: 1,
          usage: { ...EMPTY_USAGE_METRICS },
        },
      ],
      {
        start: new Date('2026-07-01T09:30:00.000Z'),
        end: new Date('2026-07-01T11:15:00.000Z'),
      },
      true
    )

    expect(densified.map((bucket) => bucket.bucketStart)).toEqual([
      '2026-07-01T09:00:00.000Z',
      '2026-07-01T10:00:00.000Z',
      '2026-07-01T11:00:00.000Z',
    ])
    expect(densified[1]?.billableCost).toBe(0.5)
    expect(densified[0]?.billableCost).toBe(0)
  })

  it('truncates to UTC day and hour boundaries', () => {
    expect(truncateToBucketStart(new Date('2026-07-01T15:42:11.123Z'), false).toISOString()).toBe(
      '2026-07-01T00:00:00.000Z'
    )
    expect(truncateToBucketStart(new Date('2026-07-01T15:42:11.123Z'), true).toISOString()).toBe(
      '2026-07-01T15:00:00.000Z'
    )
  })
})
