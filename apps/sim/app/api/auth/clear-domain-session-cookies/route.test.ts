/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { describe, expect, it } from 'vitest'
import { POST } from '@/app/api/auth/clear-domain-session-cookies/route'

describe('clear-domain-session-cookies', () => {
  it('emits a session_token clear for Domain=.thearena.ai without collapsing same-name cookies', async () => {
    const request = createMockRequest(
      'POST',
      undefined,
      {
        host: 'test-agent.thearena.ai',
        'x-forwarded-proto': 'https',
      },
      'https://test-agent.thearena.ai/api/auth/clear-domain-session-cookies'
    )

    const response = await POST(request)
    expect(response.status).toBe(200)

    const setCookies = response.headers.getSetCookie()
    const tokenClears = setCookies.filter((line) =>
      line.startsWith('__Secure-better-auth.session_token=')
    )

    expect(tokenClears.length).toBeGreaterThan(1)
    expect(tokenClears.some((line) => line.includes('Domain=.thearena.ai'))).toBe(true)
    expect(tokenClears.some((line) => /Domain=thearena\.ai;/.test(line))).toBe(true)
    expect(tokenClears.some((line) => !line.includes('Domain='))).toBe(true)

    const body = await response.json()
    expect(body.ok).toBe(true)
  })
})
