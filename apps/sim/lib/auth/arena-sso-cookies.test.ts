/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { SECRET } = vi.hoisted(() => ({
  SECRET: 'test-secret-at-least-32-characters-long!!',
}))

vi.mock('@/lib/auth', () => ({
  auth: {
    $context: Promise.resolve({
      secret: SECRET,
      authCookies: {
        sessionToken: {
          name: '__Secure-better-auth.session_token',
          attributes: { httpOnly: true, secure: true, path: '/', sameSite: 'lax' as const },
        },
        sessionData: {
          name: '__Secure-better-auth.session_data',
          attributes: {
            httpOnly: true,
            secure: true,
            path: '/',
            sameSite: 'lax' as const,
            maxAge: 300,
          },
        },
        dontRememberToken: {
          name: '__Secure-better-auth.dont_remember',
          attributes: { httpOnly: true, secure: true, path: '/', sameSite: 'lax' as const },
        },
      },
      sessionConfig: { expiresIn: 30 * 24 * 60 * 60 },
      options: {
        session: {
          cookieCache: {
            enabled: true,
            maxAge: 300,
            version: '1',
          },
        },
      },
      logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
      setNewSession: vi.fn(),
    }),
  },
}))

import { buildBetterAuthSessionSetCookies } from '@/lib/auth/arena-sso'

describe('buildBetterAuthSessionSetCookies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets signed session_token and session_data with SameSite=None', async () => {
    const now = new Date()
    const cookies = await buildBetterAuthSessionSetCookies({
      session: {
        id: 'sess-1',
        token: 'raw-db-session-token',
        userId: 'user-1',
        expiresAt: new Date(now.getTime() + 86400000),
        createdAt: now,
        updatedAt: now,
      },
      user: {
        id: 'user-1',
        name: 'Mayur',
        email: 'mayur.c@position2.com',
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
      },
    })

    const names = cookies.map((c) => c.split('=')[0])
    expect(names).toContain('__Secure-better-auth.session_token')
    expect(names).toContain('__Secure-better-auth.session_data')

    const tokenCookie = cookies.find((c) => c.startsWith('__Secure-better-auth.session_token='))
    expect(tokenCookie).toBeDefined()
    expect(tokenCookie).toContain('SameSite=None')
    expect(tokenCookie).toContain('HttpOnly')
    expect(tokenCookie).toContain('Secure')
    expect(tokenCookie).not.toContain('Domain=')
    const tokenValue = tokenCookie!
      .split(';')[0]
      .slice('__Secure-better-auth.session_token='.length)
    expect(decodeURIComponent(tokenValue)).not.toBe('raw-db-session-token')
    expect(decodeURIComponent(tokenValue)).toContain('raw-db-session-token.')

    const dataCookie = cookies.find((c) => c.startsWith('__Secure-better-auth.session_data='))
    expect(dataCookie).toBeDefined()
    expect(dataCookie).toContain('SameSite=None')
    expect(dataCookie).toContain('HttpOnly')
    expect(dataCookie).toContain('Secure')
  })
})
