/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/billing/arena/env', () => ({
  isArenaBilling: () => true,
}))

import { STARTER_PLAN } from '@/lib/billing/arena/constants'
import { onlyStarterEntitlementsRemain } from '@/lib/billing/arena/supersede-starter'

describe('onlyStarterEntitlementsRemain', () => {
  it('is true when every other entitled row is starter', () => {
    expect(onlyStarterEntitlementsRemain([{ plan: STARTER_PLAN }])).toBe(true)
  })

  it('is false when a paid plan remains', () => {
    expect(onlyStarterEntitlementsRemain([{ plan: STARTER_PLAN }, { plan: 'team_1950' }])).toBe(
      false
    )
  })

  it('is false when there are no other rows', () => {
    expect(onlyStarterEntitlementsRemain([])).toBe(false)
  })
})
