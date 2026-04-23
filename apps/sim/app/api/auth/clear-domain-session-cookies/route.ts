import { NextResponse } from 'next/server'
import {
  buildComprehensiveSessionCookieClearHeaderValues,
  isHttpsForSecureSessionCookies,
} from '@/lib/auth/legacy-session-cookie-clears'
import { resolvePublicUrlHostnameForCookieClearing } from '@/lib/auth/session-cookie-domain'
import { getBaseUrl } from '@/lib/core/utils/urls'

/**
 * Clears session cookies for every scope Better Auth / browsers may have used: host-only,
 * `Domain=<NEXT_PUBLIC host>`, and parent `Domain` (e.g. `thearena.ai`) for cross-subdomain
 * session cookies. Host-only only on localhost.
 */
function respond(request: Request) {
  const publicAppUrlIsHttps = getBaseUrl().startsWith('https://')
  const useHttps = isHttpsForSecureSessionCookies(request, publicAppUrlIsHttps)
  const hostname = resolvePublicUrlHostnameForCookieClearing()
  const res = NextResponse.json({
    ok: true,
    hostnamesCleared: hostname
      ? {
          fromNextPublicAppUrl: hostname,
          includeParentDomain: hostname.split('.').length >= 3,
        }
      : { mode: 'host-only' },
  })
  const lines = buildComprehensiveSessionCookieClearHeaderValues(
    hostname ?? 'localhost',
    useHttps
  )
  for (const value of lines) {
    res.headers.append('Set-Cookie', value)
  }
  return res
}

export function GET(request: Request) {
  return respond(request)
}

export function POST(request: Request) {
  return respond(request)
}
