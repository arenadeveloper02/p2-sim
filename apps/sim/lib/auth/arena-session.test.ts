/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    ARENA_BACKEND_BASE_URL: 'https://test-service.thearena.ai',
  },
}))

vi.mock('@/lib/core/config/env', () => ({
  env: mockEnv,
}))

import {
  extractArenaToken,
  resolveArenaTokenFromHeaders,
  validateArenaAuthToken,
} from '@/lib/auth/arena-session'

describe('arena-session helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnv.ARENA_BACKEND_BASE_URL = 'https://test-service.thearena.ai'
    vi.stubGlobal('fetch', vi.fn())
  })

  describe('extractArenaToken', () => {
    it('strips Bearer prefix case-insensitively', () => {
      expect(extractArenaToken('Bearer abc.def')).toBe('abc.def')
      expect(extractArenaToken('bearer abc.def')).toBe('abc.def')
    })

    it('returns raw token when no Bearer prefix', () => {
      expect(extractArenaToken('abc.def')).toBe('abc.def')
    })
  })

  describe('resolveArenaTokenFromHeaders', () => {
    it('prefers authorization over authorisation', () => {
      expect(
        resolveArenaTokenFromHeaders({
          authorization: 'Bearer first',
          authorisation: 'second',
        })
      ).toBe('first')
    })

    it('falls back to authorisation', () => {
      expect(resolveArenaTokenFromHeaders({ authorisation: 'arena-jwt' })).toBe('arena-jwt')
    })
  })

  describe('validateArenaAuthToken', () => {
    it('returns email when Arena reports authenticated', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            authenticated: true,
            email: 'Mayur.C@position2.com',
            errorMessage: null,
          }),
          { status: 200 }
        )
      )

      const result = await validateArenaAuthToken('arena-jwt')

      expect(result).toEqual({ ok: true, email: 'mayur.c@position2.com' })
      expect(fetch).toHaveBeenCalledWith(
        'https://test-service.thearena.ai/sol/v1/auth/user',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorisation: 'arena-jwt',
            Accept: 'application/json',
          },
        })
      )
    })

    it('returns 401 when Arena says not authenticated', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            authenticated: false,
            email: null,
            errorMessage: 'Token expired',
          }),
          { status: 200 }
        )
      )

      const result = await validateArenaAuthToken('bad')
      expect(result).toEqual({
        ok: false,
        status: 401,
        error: 'Token expired',
      })
    })

    it('returns 500 when Arena backend URL is missing', async () => {
      mockEnv.ARENA_BACKEND_BASE_URL = undefined as unknown as string
      const result = await validateArenaAuthToken('arena-jwt')
      expect(result).toEqual({
        ok: false,
        status: 500,
        error: 'Arena backend is not configured',
      })
      expect(fetch).not.toHaveBeenCalled()
    })
  })
})
