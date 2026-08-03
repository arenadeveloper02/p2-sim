/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  formatSharePercent,
  resolveOrgMemberCreditDisplay,
  resolveOrgPoolBarSegments,
} from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-utils'

describe('resolveOrgMemberCreditDisplay', () => {
  it('uses org pool remaining when no allocation is set', () => {
    const result = resolveOrgMemberCreditDisplay({
      orgPool: { totalCredits: 400_000, usedCredits: 380_000, isUnlimited: false },
      allocatedCredits: null,
      memberUsedCredits: 5_000,
    })

    expect(result.totalCredits).toBe(400_000)
    expect(result.allocatedCredits).toBeNull()
    expect(result.usedCredits).toBe(5_000)
    expect(result.remainingCredits).toBe(20_000)
  })

  it('uses the tighter of allocation and org pool when allocated', () => {
    const result = resolveOrgMemberCreditDisplay({
      orgPool: { totalCredits: 400_000, usedCredits: 380_000, isUnlimited: false },
      allocatedCredits: 50_000,
      memberUsedCredits: 10_000,
    })

    expect(result.remainingCredits).toBe(20_000)
  })

  it('uses allocation remaining when org pool has more headroom', () => {
    const result = resolveOrgMemberCreditDisplay({
      orgPool: { totalCredits: 400_000, usedCredits: 50_000, isUnlimited: false },
      allocatedCredits: 50_000,
      memberUsedCredits: 10_000,
    })

    expect(result.remainingCredits).toBe(40_000)
  })

  it('tracks progress against allocation when set', () => {
    const result = resolveOrgMemberCreditDisplay({
      orgPool: { totalCredits: 400_000, usedCredits: 100_000, isUnlimited: false },
      allocatedCredits: 50_000,
      memberUsedCredits: 10_000,
    })

    expect(result.progressNumerator).toBe(10_000)
    expect(result.progressDenominator).toBe(50_000)
    expect(result.progressPercent).toBe(20)
  })
})

describe('resolveOrgPoolBarSegments', () => {
  it('splits you vs other org usage against the pool', () => {
    const result = resolveOrgPoolBarSegments({
      orgPool: { totalCredits: 100_000_000, usedCredits: 4_573_739, isUnlimited: false },
      memberUsedCredits: 2_354_999,
    })

    expect(result.poolRemainingCredits).toBe(95_426_261)
    expect(result.usedByOthersCredits).toBe(2_218_740)
    expect(result.youPercent).toBeCloseTo(2.4, 1)
    expect(result.othersPercent).toBeCloseTo(2.2, 1)
    expect(result.remainingPercent).toBeCloseTo(95.4, 1)
  })

  it('returns unlimited remaining for unlimited pools', () => {
    const result = resolveOrgPoolBarSegments({
      orgPool: { totalCredits: 0, usedCredits: 1_000, isUnlimited: true },
      memberUsedCredits: 400,
    })

    expect(result.poolRemainingCredits).toBe('unlimited')
    expect(result.remainingPercent).toBe(100)
  })
})

describe('formatSharePercent', () => {
  it('formats a share of the whole', () => {
    expect(formatSharePercent(2_354_999, 100_000_000)).toBe('2.4%')
  })

  it('returns 0.0% when the whole is zero', () => {
    expect(formatSharePercent(10, 0)).toBe('0.0%')
  })
})
