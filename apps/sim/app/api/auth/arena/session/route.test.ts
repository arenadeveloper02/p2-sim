/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockSignInEmail,
  mockValidateArenaAuthToken,
  mockResolveArenaTokenFromHeaders,
  mockEnforceIpRateLimit,
} = vi.hoisted(() => ({
  mockSignInEmail: vi.fn(),
  mockValidateArenaAuthToken: vi.fn(),
  mockResolveArenaTokenFromHeaders: vi.fn(),
  mockEnforceIpRateLimit: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      signInEmail: mockSignInEmail,
    },
  },
}))

vi.mock('@/lib/auth/arena-session', () => ({
  ARENA_SHARED_SIGN_IN_PASSWORD: 'Position2!',
  resolveArenaTokenFromHeaders: mockResolveArenaTokenFromHeaders,
  validateArenaAuthToken: mockValidateArenaAuthToken,
}))

vi.mock('@/lib/core/rate-limiter', () => ({
  enforceIpRateLimit: mockEnforceIpRateLimit,
}))

import { POST } from '@/app/api/auth/arena/session/route'

describe('POST /api/auth/arena/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnforceIpRateLimit.mockResolvedValue(null)
    mockResolveArenaTokenFromHeaders.mockReturnValue('arena-jwt')
    mockValidateArenaAuthToken.mockResolvedValue({
      ok: true,
      email: 'mayur.c@position2.com',
    })
    mockSignInEmail.mockResolvedValue(
      new Response(JSON.stringify({ token: 'session-token', user: { id: 'user-1' } }), {
        status: 200,
        headers: {
          'set-cookie': 'better-auth.session_token=abc; Path=/; HttpOnly',
        },
      })
    )
  })

  it('returns session cookies when Arena token is valid', async () => {
    const request = createMockRequest(
      'POST',
      undefined,
      { authorization: 'arena-jwt' },
      'http://localhost:3000/api/auth/arena/session'
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ success: true, email: 'mayur.c@position2.com' })
    expect(response.headers.getSetCookie()).toContain(
      'better-auth.session_token=abc; Path=/; HttpOnly'
    )
    expect(mockValidateArenaAuthToken).toHaveBeenCalledWith('arena-jwt', request.signal)
    expect(mockSignInEmail).toHaveBeenCalledWith({
      body: {
        email: 'mayur.c@position2.com',
        password: 'Position2!',
      },
      asResponse: true,
    })
  })

  it('accepts Authorisation header spelling via resolve helper', async () => {
    mockResolveArenaTokenFromHeaders.mockReturnValue('arena-jwt-british')
    const request = createMockRequest(
      'POST',
      undefined,
      { authorisation: 'arena-jwt-british' },
      'http://localhost:3000/api/auth/arena/session'
    )

    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(mockResolveArenaTokenFromHeaders).toHaveBeenCalled()
    expect(mockValidateArenaAuthToken).toHaveBeenCalledWith('arena-jwt-british', request.signal)
  })

  it('returns 401 when Arena token is invalid', async () => {
    mockValidateArenaAuthToken.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'Invalid or expired Arena token',
    })

    const request = createMockRequest(
      'POST',
      undefined,
      { authorization: 'bad-token' },
      'http://localhost:3000/api/auth/arena/session'
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Invalid or expired Arena token')
    expect(mockSignInEmail).not.toHaveBeenCalled()
  })

  it('returns 400 when authorization header is missing', async () => {
    mockResolveArenaTokenFromHeaders.mockReturnValue(null)
    const request = createMockRequest(
      'POST',
      undefined,
      {},
      'http://localhost:3000/api/auth/arena/session'
    )

    const response = await POST(request)
    expect(response.status).toBe(400)
    expect(mockSignInEmail).not.toHaveBeenCalled()
  })

  it('returns rate-limit response when exceeded', async () => {
    mockEnforceIpRateLimit.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })
    )

    const request = createMockRequest(
      'POST',
      undefined,
      { authorization: 'arena-jwt' },
      'http://localhost:3000/api/auth/arena/session'
    )

    const response = await POST(request)
    expect(response.status).toBe(429)
    expect(mockValidateArenaAuthToken).not.toHaveBeenCalled()
  })

  it('returns 401 when Better Auth sign-in fails', async () => {
    mockSignInEmail.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid email or password' }), { status: 401 })
    )

    const request = createMockRequest(
      'POST',
      undefined,
      { authorization: 'arena-jwt' },
      'http://localhost:3000/api/auth/arena/session'
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Invalid email or password')
  })
})
