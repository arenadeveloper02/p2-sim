import { env } from '@/lib/core/config/env'

/**
 * `Domain=` for session cookie clears: hostname from `NEXT_PUBLIC_APP_URL` only
 * (e.g. `https://agent.thearena.ai` → `agent.thearena.ai`). No `BETTER_AUTH_COOKIE_DOMAIN`.
 * `undefined` for localhost → host-only Set-Cookie clears.
 */
export function resolveSessionCookieDomainForClearing(): string | undefined {
  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim()
  if (!appUrl) {
    return undefined
  }

  try {
    const hostname = new URL(appUrl).hostname.toLowerCase()
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return undefined
    }
    return hostname
  } catch {
    return undefined
  }
}
