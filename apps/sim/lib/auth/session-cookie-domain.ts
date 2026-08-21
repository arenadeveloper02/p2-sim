import { env } from '@/lib/core/config/env'

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * Hostname from a URL or host-only env value (`https://test-agent.thearena.ai` or
 * `test-agent.thearena.ai`). `undefined` for localhost / unparseable input.
 */
function hostnameFromUrlish(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const hostname = new URL(withProtocol).hostname.toLowerCase()
    if (isLoopbackHostname(hostname)) {
      return undefined
    }
    return hostname
  } catch {
    return undefined
  }
}

/**
 * Hostname from `NEXT_PUBLIC_APP_URL` (e.g. `https://test-agent.thearena.ai` → `test-agent.thearena.ai`).
 * `undefined` for localhost in URL or bad env; callers then use only host-only clears.
 */
export function resolvePublicUrlHostnameForCookieClearing(): string | undefined {
  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim()
  if (!appUrl) {
    return undefined
  }
  return hostnameFromUrlish(appUrl)
}

/**
 * Hostname the browser actually requested (`Host` / `X-Forwarded-Host`). Cookie
 * deletes must target this host's jar, which can differ from `NEXT_PUBLIC_APP_URL`.
 */
export function resolveRequestHostnameForCookieClearing(request: Request): string | undefined {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  let host = forwardedHost || request.headers.get('host')?.trim()
  if (!host) {
    try {
      host = new URL(request.url).host
    } catch {
      return undefined
    }
  }

  const hostname = host.replace(/:\d+$/, '').toLowerCase()
  if (!hostname || isLoopbackHostname(hostname)) {
    return undefined
  }
  return hostname
}

/**
 * Hostnames whose session cookies should be expired: public app URL and the
 * inbound request host (deduped). Empty → host-only clears only.
 */
export function resolveHostnamesForCookieClearing(request: Request): string[] {
  const hostnames = new Set<string>()
  const fromPublic = resolvePublicUrlHostnameForCookieClearing()
  const fromRequest = resolveRequestHostnameForCookieClearing(request)
  if (fromPublic) {
    hostnames.add(fromPublic)
  }
  if (fromRequest) {
    hostnames.add(fromRequest)
  }
  return [...hostnames]
}
