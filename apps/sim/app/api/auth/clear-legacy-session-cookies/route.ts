import { NextResponse } from 'next/server'
import {
  buildHostOnlySessionCookieClearHeaderValues,
  isHttpsForSecureSessionCookies,
} from '@/lib/auth/legacy-session-cookie-clears'
import { getBaseUrl } from '@/lib/core/utils/urls'

/**
 * Clears host-only Better Auth session cookies (no `Domain=`) left over from older deployments.
 * Domain-scoped cookies are handled by normal `/api/auth/sign-out`; this route is for the
 * duplicate host-only copies. Same Set-Cookie logic as the sign-out `hooks.after` hook.
 *
 * Call from the browser (GET or POST, same origin) so `Set-Cookie` applies to this host.
 */
function respond(request: Request) {
  const publicAppUrlIsHttps = getBaseUrl().startsWith('https://')
  const useHttps = isHttpsForSecureSessionCookies(request, publicAppUrlIsHttps)
  const res = NextResponse.json({
    ok: true,
    cleared: 'host-only-better-auth-session-cookies',
  })
  for (const value of buildHostOnlySessionCookieClearHeaderValues(useHttps)) {
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
