/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STARTER_PLAN } from '@/lib/billing/arena/constants'
import { getArenaPlanTypeForLimits } from '@/lib/billing/arena/plan-limits'
import { ARENA_MAX_PLAN, ARENA_PRO_PLAN } from '@/lib/billing/arena/tier-config'

const { mockIsArenaBilling } = vi.hoisted(() => ({
  mockIsArenaBilling: vi.fn(() => true),
}))

vi.mock('@/lib/billing/arena/env', () => ({
  isArenaBilling: mockIsArenaBilling,
}))

describe('getArenaPlanTypeForLimits', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockIsArenaBilling.mockReturnValue(true)
  })

  it('maps starter to pro and arena max to team', () => {
    expect(getArenaPlanTypeForLimits(STARTER_PLAN)).toBe('pro')
    expect(getArenaPlanTypeForLimits(ARENA_MAX_PLAN)).toBe('team')
  })

  it('maps arena pro to the pro limits bucket', () => {
    expect(getArenaPlanTypeForLimits(ARENA_PRO_PLAN)).toBe('pro')
  })

  it('returns null for non-arena plans', () => {
    expect(getArenaPlanTypeForLimits('pro_6000')).toBeNull()
    expect(getArenaPlanTypeForLimits('team_6000')).toBeNull()
  })

  it('returns null when arena billing is disabled', () => {
    mockIsArenaBilling.mockReturnValue(false)
    expect(getArenaPlanTypeForLimits(STARTER_PLAN)).toBeNull()
  })
})
