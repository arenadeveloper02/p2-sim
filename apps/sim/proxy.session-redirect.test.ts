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

describe('public /chat and unauthenticated Arena resume', () => {
  it('allows /chat without a session', async () => {
    const chatUrl =
      'https://agent.thearena.ai/chat/2a5e3fb4-69a2-4897-8f76-7c96ae802c36?workspaceId=a29a4193-4407-48ae-b8df-b0ebf0cd81b2&chatId=d7233682-ce75-4404-9848-df45884f0f14'
    const response = await proxy(new NextRequest(chatUrl))

    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('allows a /chat flight without a session', async () => {
    const response = await proxy(
      new NextRequest(
        'https://agent.thearena.ai/chat/2a5e3fb4-69a2-4897-8f76-7c96ae802c36?workspaceId=ws-1&_rsc=abc',
        { headers: { RSC: '1' } }
      )
    )

    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('does not SSO-bounce a root flight whose Next-Url is a public chat', async () => {
    const response = await proxy(
      new NextRequest('https://agent.thearena.ai/?_rsc=v2Q3iEZRy_tFQofn', {
        headers: {
          RSC: '1',
          'Next-Url': '/chat/2a5e3fb4-69a2-4897-8f76-7c96ae802c36',
          'next-router-prefetch': '1',
          referer:
            'https://agent.thearena.ai/chat/2a5e3fb4-69a2-4897-8f76-7c96ae802c36?workspaceId=ws-1',
        },
      })
    )

    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('sends a document request to / straight to Arena sim-resume', async () => {
    const response = await proxy(new NextRequest('https://agent.thearena.ai/'))
    const location = locationOf(response)

    expect(location.origin).toBe('https://app.thearena.ai')
    expect(location.pathname).toBe('/sso/sim-resume')
    expect(location.searchParams.get('returnTo')).toBe('https://agent.thearena.ai/')
  })

  it('keeps a protected workspace flight on this origin with path returnTo', async () => {
    const response = await proxy(
      new NextRequest('https://agent.thearena.ai/workspace/abc?tab=1&_rsc=xyz', {
        headers: { RSC: '1' },
      })
    )
    const location = locationOf(response)

    expect(location.origin).toBe('https://agent.thearena.ai')
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
