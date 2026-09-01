/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockIsArenaBilling } = vi.hoisted(() => ({
  mockIsArenaBilling: vi.fn(),
}))

vi.mock('@/lib/billing/arena/env', () => ({
  isArenaBilling: mockIsArenaBilling,
}))

vi.mock('@/lib/core/config/env', () => ({
  env: {},
  isTruthy: (value: unknown) => value === true || value === 'true' || value === 1,
}))

import { isDailyRefreshEnabled } from '@/lib/billing/arena/daily-refresh-policy'

describe('isDailyRefreshEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsArenaBilling.mockReturnValue(true)
  })

  it('is off by default when Arena billing is active', () => {
    expect(isDailyRefreshEnabled()).toBe(false)
  })

  it('is on when Arena billing is inactive (upstream behavior)', () => {
    mockIsArenaBilling.mockReturnValue(false)
    expect(isDailyRefreshEnabled()).toBe(true)
  })
})
