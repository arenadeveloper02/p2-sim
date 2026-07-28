/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { resolveOrgMemberCreditDisplay } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-utils'

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
