import { NextResponse } from 'next/server'
import {
  buildDomainSessionCookieClearHeaderValues,
  buildHostOnlySessionCookieClearHeaderValues,
  isHttpsRequest,
} from '@/lib/auth/legacy-session-cookie-clears'
import { resolveSessionCookieDomainForClearing } from '@/lib/auth/session-cookie-domain'

/**
 * Clears Better Auth session cookies with `Domain=` = hostname of `NEXT_PUBLIC_APP_URL` only
 * (e.g. `agent.thearena.ai` from `https://agent.thearena.ai`). Host-only on localhost.
 */
function respond(request: Request) {
  const useHttps = isHttpsRequest(request)
  const domain = resolveSessionCookieDomainForClearing()
  const res = NextResponse.json({
    ok: true,
    mode: domain ? 'domain' : 'host-only',
    ...(domain ? { domain } : {}),
  })
  const lines = domain
    ? buildDomainSessionCookieClearHeaderValues(domain, useHttps)
    : buildHostOnlySessionCookieClearHeaderValues(useHttps)
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
