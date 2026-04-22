/**
 * Helpers to clear Better Auth session cookies that were set as **host-only** (no `Domain`),
 * which standard sign-out does not remove when `crossSubDomainCookies` / `Domain=` is in use.
 * Cookie names match better-auth defaults (`better-auth` prefix, optional `__Secure-`).
 */

const COOKIE_PREFIX = 'better-auth'

const SESSION_RELATED = ['session_token', 'session_data', 'dont_remember'] as const

export function clearHostOnlyBetterAuthSessionCookies(
  ctx: { setCookie: (name: string, value: string, opts: Record<string, unknown>) => void },
  useHttps: boolean
) {
  const namePrefix = useHttps ? '__Secure-' : ''
  const base = {
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: useHttps,
    sameSite: 'lax' as const,
  }
  for (const suffix of SESSION_RELATED) {
    ctx.setCookie(`${namePrefix}${COOKIE_PREFIX}.${suffix}`, '', base)
  }
}

/**
 * Full `Set-Cookie` header values (one cookie per string) for host-only clears.
 */
export function buildHostOnlySessionCookieClearHeaderValues(useHttps: boolean): string[] {
  const namePrefix = useHttps ? '__Secure-' : ''
  const secure = useHttps ? 'Secure; ' : ''
  return SESSION_RELATED.map(
    (suffix) =>
      `${namePrefix}${COOKIE_PREFIX}.${suffix}=; Max-Age=0; Path=/; HttpOnly; ${secure}SameSite=Lax`
  )
}

/**
 * Set-Cookie header values that clear session cookies with `Domain=` (cross-subdomain cookies).
 */
export function buildDomainSessionCookieClearHeaderValues(domain: string, useHttps: boolean): string[] {
  const namePrefix = useHttps ? '__Secure-' : ''
  const secure = useHttps ? 'Secure; ' : ''
  return SESSION_RELATED.map(
    (suffix) =>
      `${namePrefix}${COOKIE_PREFIX}.${suffix}=; Max-Age=0; Domain=${domain}; Path=/; HttpOnly; ${secure}SameSite=Lax`
  )
}

/**
 * Derives a parent "site" domain for multi-label hostnames (e.g. `test-agent.thearena.ai` →
 * `thearena.ai`). Returns `undefined` for two-label hosts or localhost. Naive; sufficient for
 * `*.thearena.*`-style deploys, not for all public suffixes (e.g. `co.uk`).
 */
export function getParentDomainFromPublicHostname(hostname: string): string | undefined {
  const parts = hostname.toLowerCase().split('.')
  if (parts.length < 3) {
    return undefined
  }
  return parts.slice(-2).join('.')
}

/**
 * Full Set-Cookie sweep for the three session cookies: host-only, `Domain=publicUrlHostname`, and
 * `Domain=parent` when the hostname has 3+ labels. A clear only removes the store that matches
 * that exact name+Domain+Path; a cookie set with `Domain=thearena.ai` is *not* removed by
 * `Domain=test-agent.thearena.ai` alone.
 */
export function buildComprehensiveSessionCookieClearHeaderValues(
  publicUrlHostname: string,
  useHttps: boolean
): string[] {
  if (
    publicUrlHostname === 'localhost' ||
    publicUrlHostname === '127.0.0.1' ||
    publicUrlHostname === '[::1]'
  ) {
    return buildHostOnlySessionCookieClearHeaderValues(useHttps)
  }

  const lines: string[] = []
  lines.push(...buildHostOnlySessionCookieClearHeaderValues(useHttps))
  lines.push(...buildDomainSessionCookieClearHeaderValues(publicUrlHostname, useHttps))
  const parent = getParentDomainFromPublicHostname(publicUrlHostname)
  if (parent && parent !== publicUrlHostname) {
    lines.push(...buildDomainSessionCookieClearHeaderValues(parent, useHttps))
  }
  return lines
}

/**
 * Whether the client connection is effectively HTTPS, for choosing `__Secure-` cookie names
 * and the `Secure` attribute. Behind reverse proxies, `Request.url` is often `http` while
 * `X-Forwarded-Proto` is `https` — if we wrongly treat that as HTTP, we emit `better-auth.*`
 * clears and **never** remove `__Secure-better-auth.*` cookies.
 */
export function isHttpsRequest(request: Request): boolean {
  const url = new URL(request.url)
  if (url.protocol === 'https:') {
    return true
  }
  const forwarded = request.headers.get('x-forwarded-proto')?.toLowerCase()
  if (forwarded) {
    const first = forwarded.split(',')[0].trim()
    if (first === 'https') {
      return true
    }
  }
  if (request.headers.get('x-forwarded-ssl')?.toLowerCase() === 'on') {
    return true
  }
  if (request.headers.get('x-url-scheme')?.toLowerCase() === 'https') {
    return true
  }
  return false
}

/**
 * True if session cookies are almost certainly the `__Secure-` + `Secure` form (production HTTPS).
 * Uses the request, then falls back to the public app URL (same source as `NEXT_PUBLIC_APP_URL`).
 */
export function isHttpsForSecureSessionCookies(
  request: Request,
  publicAppUrlIsHttps: boolean
): boolean {
  return isHttpsRequest(request) || publicAppUrlIsHttps
}
