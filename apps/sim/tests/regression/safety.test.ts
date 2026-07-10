/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  assertAllowedEmailDestinations,
  assertAllowedSlackDestination,
  isExcludedIntegration,
} from '@/tests/regression/safety'

describe('regression safety policy', () => {
  it('allows #slack-testing channel id', () => {
    expect(() => assertAllowedSlackDestination({ channel: 'C0BDTEZPF7C' })).not.toThrow()
  })

  it('blocks other slack channels', () => {
    expect(() => assertAllowedSlackDestination({ channel: '#general' })).toThrow()
  })

  it('allows regression email recipient', () => {
    expect(() =>
      assertAllowedEmailDestinations({ to: 'akshay.v@position2.com' })
    ).not.toThrow()
  })

  it('blocks other email recipients', () => {
    expect(() => assertAllowedEmailDestinations({ to: 'other@example.com' })).toThrow()
  })

  it('excludes notion', () => {
    expect(isExcludedIntegration('notion')).toBe(true)
    expect(isExcludedIntegration('slack')).toBe(false)
  })
})
