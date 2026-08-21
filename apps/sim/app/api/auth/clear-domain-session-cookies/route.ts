import type { NextRequest } from 'next/server'
import {
  buildComprehensiveSessionCookieClearHeaderValuesForHostnames,
  createSessionCookieClearResponse,
  isHttpsForSecureSessionCookies,
} from '@/lib/auth/legacy-session-cookie-clears'
import { resolveHostnamesForCookieClearing } from '@/lib/auth/session-cookie-domain'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

export const dynamic = 'force-dynamic'

/**
 * Clears session cookies for every scope Better Auth / browsers may have used: host-only,
 * `Domain=<request host>`, `Domain=<NEXT_PUBLIC host>`, and parent `Domain` (e.g. `thearena.ai`
 * and `.thearena.ai`) for cross-subdomain session cookies. Host-only only on localhost.
 */
function respond(request: Request) {
  const publicAppUrlIsHttps = getBaseUrl().startsWith('https://')
  const useHttps = isHttpsForSecureSessionCookies(request, publicAppUrlIsHttps)
  const hostnames = resolveHostnamesForCookieClearing(request)
  const lines = buildComprehensiveSessionCookieClearHeaderValuesForHostnames(hostnames, useHttps)
  return createSessionCookieClearResponse(
    {
      ok: true,
      hostnamesCleared: hostnames.length
        ? {
            hostnames,
            includeParentDomain: hostnames.some((hostname) => hostname.split('.').length >= 3),
          }
        : { mode: 'host-only' },
    },
    lines
  )
}

export const GET = withRouteHandler(async (request: NextRequest) => respond(request))

export const POST = withRouteHandler(async (request: NextRequest) => respond(request))
