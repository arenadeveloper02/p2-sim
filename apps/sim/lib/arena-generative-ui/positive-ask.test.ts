/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { hasPositiveAsk } from '@/lib/arena-generative-ui/positive-ask'

const DASHBOARD = /\bdashboard\b/i

describe('hasPositiveAsk', () => {
  it('accepts a positive construction', () => {
    expect(hasPositiveAsk('Build a weather dashboard.', DASHBOARD)).toBe(true)
    expect(hasPositiveAsk('Build a weather dashboard. Do not add extra pages.', DASHBOARD)).toBe(
      true
    )
  })

  it('rejects a negated construction', () => {
    expect(hasPositiveAsk('Simple todo. Do not add a dashboard.', DASHBOARD)).toBe(false)
    expect(hasPositiveAsk("Don't make this a dashboard.", DASHBOARD)).toBe(false)
    expect(hasPositiveAsk('A simple todo must not become dashboard + stats.', DASHBOARD)).toBe(
      false
    )
  })
})
