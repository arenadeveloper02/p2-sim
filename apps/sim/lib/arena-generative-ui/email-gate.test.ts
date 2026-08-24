/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { shouldDenyMissingArenaEmailId } from '@/lib/arena-generative-ui/email-gate'

describe('shouldDenyMissingArenaEmailId', () => {
  it('denies a public Arena-gated app with no emailId', () => {
    expect(
      shouldDenyMissingArenaEmailId({
        requireArenaEmailId: true,
        emailId: '',
        authType: 'public',
      })
    ).toBe(true)
  })

  it('lets email, password, and SSO apps show their login without emailId', () => {
    for (const authType of ['email', 'password', 'sso'] as const) {
      expect(
        shouldDenyMissingArenaEmailId({
          requireArenaEmailId: true,
          emailId: '',
          authType,
        })
      ).toBe(false)
    }
  })

  it('treats a missing authType as public, so the embed gate still applies', () => {
    expect(
      shouldDenyMissingArenaEmailId({
        requireArenaEmailId: true,
        emailId: '',
      })
    ).toBe(true)
  })

  it('allows the request when emailId is present or the gate is off', () => {
    expect(
      shouldDenyMissingArenaEmailId({
        requireArenaEmailId: true,
        emailId: 'ada@example.com',
        authType: 'public',
      })
    ).toBe(false)
    expect(
      shouldDenyMissingArenaEmailId({
        requireArenaEmailId: false,
        emailId: '',
        authType: 'public',
      })
    ).toBe(false)
  })
})
