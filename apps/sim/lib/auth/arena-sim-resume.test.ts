/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetEnv } = vi.hoisted(() => ({
  mockGetEnv: vi.fn<(key: string) => string | undefined>(),
}))

vi.mock('@/lib/core/config/env', () => ({
  getEnv: mockGetEnv,
}))

vi.mock('@/lib/core/utils/urls', () => ({
  getLoginRedirectUrl: () => 'https://app.thearena.ai/',
}))

import {
  ARENA_SSO_SESSION_REQUIRED_PATH,
  resolveBrowserSessionResumeHref,
} from '@/lib/auth/arena-sim-resume'

describe('resolveBrowserSessionResumeHref', () => {
  beforeEach(() => {
    mockGetEnv.mockReset()
    mockGetEnv.mockReturnValue(undefined)
  })

  it('uses local login with callbackUrl in development', () => {
    expect(
      resolveBrowserSessionResumeHref('https://localhost:3000/chat/abc', { isDev: true })
    ).toBe('/login?callbackUrl=https%3A%2F%2Flocalhost%3A3000%2Fchat%2Fabc')
  })

  it('uses Arena sim-resume when the hub env is set', () => {
    mockGetEnv.mockImplementation((key) =>
      key === 'NEXT_PUBLIC_ARENA_FRONTEND_APP_URL' ? 'https://app.thearena.ai' : undefined
    )

    const href = resolveBrowserSessionResumeHref('https://agent.thearena.ai/chat/abc', {
      hostname: 'agent.thearena.ai',
    })
    const url = new URL(href)
    expect(url.origin).toBe('https://app.thearena.ai')
    expect(url.pathname).toBe('/sso/sim-resume')
    expect(url.searchParams.get('returnTo')).toBe('https://agent.thearena.ai/chat/abc')
  })

  it('falls back to session-required when no hub can be resolved', () => {
    expect(resolveBrowserSessionResumeHref('https://agent.thearena.ai/chat/abc')).toBe(
      ARENA_SSO_SESSION_REQUIRED_PATH
    )
  })
})
