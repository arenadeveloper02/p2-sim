import type { NextRequest } from 'next/server'
import {
  buildHostOnlySessionCookieClearHeaderValues,
  createSessionCookieClearResponse,
  isHttpsForSecureSessionCookies,
} from '@/lib/auth/legacy-session-cookie-clears'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

export const dynamic = 'force-dynamic'

/**
 * Clears host-only Better Auth session cookies (no `Domain=`) left over from older deployments.
 * Domain-scoped cookies are handled by `/api/auth/clear-domain-session-cookies` and sign-out;
 * this route is for the duplicate host-only copies.
 *
 * Call from the browser (GET or POST, same origin) so `Set-Cookie` applies to this host.
 */
function respond(request: Request) {
  const publicAppUrlIsHttps = getBaseUrl().startsWith('https://')
  const useHttps = isHttpsForSecureSessionCookies(request, publicAppUrlIsHttps)
  return createSessionCookieClearResponse(
    {
      ok: true,
      cleared: 'host-only-better-auth-session-cookies',
    },
    buildHostOnlySessionCookieClearHeaderValues(useHttps)
  )
}

export const GET = withRouteHandler(async (request: NextRequest) => respond(request))

export const POST = withRouteHandler(async (request: NextRequest) => respond(request))
