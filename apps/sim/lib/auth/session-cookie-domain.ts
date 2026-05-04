import { env } from '@/lib/core/config/env'

/**
 * Hostname from `NEXT_PUBLIC_APP_URL` (e.g. `https://test-agent.thearena.ai` → `test-agent.thearena.ai`).
 * `undefined` for localhost in URL or bad env; callers then use only host-only clears.
 */
export function resolvePublicUrlHostnameForCookieClearing(): string | undefined {
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
