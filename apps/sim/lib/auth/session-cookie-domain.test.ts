/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  resolveHostnamesForCookieClearing,
  resolveRequestHostnameForCookieClearing,
} from '@/lib/auth/session-cookie-domain'

describe('resolveRequestHostnameForCookieClearing', () => {
  it('prefers X-Forwarded-Host over Host', () => {
    const request = new Request('http://127.0.0.1/api/auth/clear-domain-session-cookies', {
      headers: {
        host: 'internal.local',
        'x-forwarded-host': 'test-agent.thearena.ai',
      },
    })
    expect(resolveRequestHostnameForCookieClearing(request)).toBe('test-agent.thearena.ai')
  })

  it('strips a port from Host', () => {
    const request = new Request('http://127.0.0.1/api/auth/clear-domain-session-cookies', {
      headers: { host: 'test-agent.thearena.ai:443' },
    })
    expect(resolveRequestHostnameForCookieClearing(request)).toBe('test-agent.thearena.ai')
  })

  it('returns undefined for localhost', () => {
    const request = new Request('http://localhost:3000/api/auth/clear-domain-session-cookies', {
      headers: { host: 'localhost:3000' },
    })
    expect(resolveRequestHostnameForCookieClearing(request)).toBeUndefined()
  })
})

describe('resolveHostnamesForCookieClearing', () => {
  it('includes the request host even when NEXT_PUBLIC_APP_URL is unset', () => {
    const request = new Request(
      'https://test-agent.thearena.ai/api/auth/clear-domain-session-cookies',
      {
        headers: { host: 'test-agent.thearena.ai' },
      }
    )
    expect(resolveHostnamesForCookieClearing(request)).toContain('test-agent.thearena.ai')
  })
})
