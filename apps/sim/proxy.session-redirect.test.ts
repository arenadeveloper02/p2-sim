/**
 * @vitest-environment node
 */
import { createEnvMock, envFlagsMock } from '@sim/testing'
import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/core/config/env-flags', () => ({
  ...envFlagsMock,
  isLocalLoginEnabled: false,
  isAuthDisabled: false,
}))

vi.mock('@/lib/core/config/env', () =>
  createEnvMock({
    NEXT_PUBLIC_APP_URL: 'https://agent.thearena.ai',
    NEXT_PUBLIC_ARENA_FRONTEND_APP_URL: 'https://app.thearena.ai',
  })
)

vi.unmock('@/lib/core/utils/urls')

import { proxy } from '@/proxy'

function locationOf(response: Response): URL {
  const location = response.headers.get('location')
  if (!location) throw new Error('expected a redirect')
  return new URL(location)
}

describe('unauthenticated Arena resume', () => {
  it('sends a document request straight to Arena sim-resume', async () => {
    const response = await proxy(new NextRequest('https://agent.thearena.ai/'))
    const location = locationOf(response)

    expect(location.origin).toBe('https://app.thearena.ai')
    expect(location.pathname).toBe('/sso/sim-resume')
    expect(location.searchParams.get('returnTo')).toBe('https://agent.thearena.ai/')
  })

  it('keeps a Next.js flight request on this origin', async () => {
    const response = await proxy(
      new NextRequest('https://agent.thearena.ai/?_rsc=abc', {
        headers: { RSC: '1', 'Next-Url': '/' },
      })
    )
    const location = locationOf(response)

    expect(location.origin).toBe('https://agent.thearena.ai')
    expect(location.pathname).toBe('/auth/arena-sso-redirect')
    expect(location.searchParams.get('returnTo')).toBe('https://agent.thearena.ai/')
    expect(location.searchParams.has('_rsc')).toBe(false)
  })

  it('keeps a workspace flight request on this origin and preserves the path', async () => {
    const response = await proxy(
      new NextRequest('https://agent.thearena.ai/workspace/abc?tab=1&_rsc=xyz', {
        headers: { RSC: '1' },
      })
    )
    const location = locationOf(response)

    expect(location.pathname).toBe('/auth/arena-sso-redirect')
    expect(location.searchParams.get('returnTo')).toBe(
      'https://agent.thearena.ai/workspace/abc?tab=1'
    )
  })

  it('does not bounce the same-origin resume page again', async () => {
    const response = await proxy(
      new NextRequest(
        'https://agent.thearena.ai/auth/arena-sso-redirect?returnTo=https%3A%2F%2Fagent.thearena.ai%2F',
        { headers: { RSC: '1' } }
      )
    )

    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})
