/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  assertSpendCapAllows,
  remainingSpendBudget,
} from '@/local-copilot/lib/billing/spend-cap'

describe('spend cap', () => {
  it('computes remaining budget', () => {
    expect(remainingSpendBudget({ limit: 10, currentUsage: 7, turnSoFar: 1 })).toBe(2)
    expect(remainingSpendBudget({ limit: 10, currentUsage: 12, turnSoFar: 0 })).toBe(0)
  })

  it('allows when under limit', () => {
    expect(
      assertSpendCapAllows({
        isExceeded: false,
        currentUsage: 5,
        limit: 20,
        turnSoFar: 1,
      })
    ).toEqual({ ok: true, remaining: 14 })
  })

  it('blocks when pre-exceeded or turn would exhaust budget', () => {
    expect(
      assertSpendCapAllows({
        isExceeded: true,
        currentUsage: 25,
        limit: 20,
        turnSoFar: 0,
        message: 'Usage limit exceeded',
      }).ok
    ).toBe(false)

    expect(
      assertSpendCapAllows({
        isExceeded: false,
        currentUsage: 19.5,
        limit: 20,
        turnSoFar: 0.6,
      }).ok
    ).toBe(false)
  })
})
