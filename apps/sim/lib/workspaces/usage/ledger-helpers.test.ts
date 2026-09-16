/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  densifyTimeSeries,
  EMPTY_USAGE_METRICS,
  mapBySourceBucketRow,
  truncateToBucketStart,
} from '@/lib/workspaces/usage/ledger-helpers'
import { normalizeBucketKey, parseIntMetric } from '@/lib/workspaces/usage/ledger-utils'

/**
 * Documents the usage_log ⨯ copilot_runs fan-out that inflated mothership
 * chat credits (e.g. Kangaroo 20 → 40) before run counts used a subquery.
 */
describe('copilot chat cost join cardinality', () => {
  it('naive join multiplies ledger cost by run count', () => {
    const usageRowCost = 0.102036
    const runCount = 2
    const naiveJoinedSum = usageRowCost * runCount
    expect(Math.round(naiveJoinedSum * 200)).toBe(41)
    expect(Math.round(usageRowCost * 200)).toBe(20)
  })
})

describe('parseIntMetric', () => {
  it('coerces postgres.js bigint and numeric strings', () => {
    expect(parseIntMetric(42n)).toBe(42)
    expect(parseIntMetric(0n)).toBe(0)
    expect(parseIntMetric('12')).toBe(12)
    expect(parseIntMetric(null)).toBe(0)
  })
})

describe('normalizeBucketKey', () => {
  it('replaces null or blank keys so z.string() contracts pass', () => {
    expect(normalizeBucketKey(null)).toBe('unknown')
    expect(normalizeBucketKey('  ')).toBe('unknown')
    expect(normalizeBucketKey('gpt-4o')).toBe('gpt-4o')
  })
})

describe('mapBySourceBucketRow', () => {
  it('maps valid sources with label fallback and coerced counts', () => {
    expect(
      mapBySourceBucketRow({
        source: 'wand',
        label: null,
        billableCost: '1.5',
        rawCost: '1.2',
        count: '3',
        inputTokens: 10n,
        outputTokens: 0n,
        totalTokens: 10n,
        invocationCount: 3,
      })
    ).toEqual({
      source: 'wand',
      label: 'Wand',
      billableCost: 1.5,
      rawCost: 1.2,
      count: 3,
      usage: {
        inputTokens: 10,
        outputTokens: 0,
        totalTokens: 10,
        invocationCount: 3,
      },
    })
  })

  it('returns null for invalid ledger sources instead of throwing', () => {
    expect(
      mapBySourceBucketRow({
        source: 'arena-ai',
        label: 'Arena AI',
        billableCost: '1',
        rawCost: '1',
        count: 1,
      })
    ).toBeNull()
  })
})

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
