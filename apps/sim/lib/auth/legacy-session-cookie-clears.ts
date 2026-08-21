/**
 * Helpers to clear Better Auth session cookies that were set as **host-only** (no `Domain`),
 * which standard sign-out does not remove when `crossSubDomainCookies` / `Domain=` is in use.
 * Cookie names match better-auth defaults (`better-auth` prefix, optional `__Secure-`).
 */

const COOKIE_PREFIX = 'better-auth'

const SESSION_RELATED = ['session_token', 'session_data', 'dont_remember'] as const

/** RFC 6265 epoch expiry. Some browsers ignore `Max-Age=0` without `Expires`. */
const EXPIRES_PAST = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'

function sessionCookieName(suffix: (typeof SESSION_RELATED)[number], useHttps: boolean): string {
  const namePrefix = useHttps ? '__Secure-' : ''
  return `${namePrefix}${COOKIE_PREFIX}.${suffix}`
}

function serializeSessionCookieClear(name: string, useHttps: boolean, domain?: string): string {
  const secure = useHttps ? 'Secure; ' : ''
  const domainAttr = domain ? `Domain=${domain}; ` : ''
  return `${name}=; Max-Age=0; ${EXPIRES_PAST}; ${domainAttr}Path=/; HttpOnly; ${secure}SameSite=Lax`
}

export function clearHostOnlyBetterAuthSessionCookies(
  ctx: { setCookie: (name: string, value: string, opts: Record<string, unknown>) => void },
  useHttps: boolean
) {
  const base = {
    maxAge: 0,
    expires: new Date(0),
    path: '/',
    httpOnly: true,
    secure: useHttps,
    sameSite: 'lax' as const,
  }
  for (const suffix of SESSION_RELATED) {
    ctx.setCookie(sessionCookieName(suffix, useHttps), '', base)
  }
}

/**
 * Full `Set-Cookie` header values (one cookie per string) for host-only clears.
 */
export function buildHostOnlySessionCookieClearHeaderValues(useHttps: boolean): string[] {
  return SESSION_RELATED.map((suffix) =>
    serializeSessionCookieClear(sessionCookieName(suffix, useHttps), useHttps)
  )
}

/**
 * `Domain` attribute strings that may match a stored cookie. RFC 6265 treats a
 * leading dot as optional, but Chromium only deletes when the attribute matches
 * the originally stored form (`thearena.ai` vs `.thearena.ai`).
 */
export function domainAttributeVariants(domain: string): string[] {
  const stripped = domain.replace(/^\./, '').toLowerCase()
  if (!stripped) {
    return []
  }
  return [stripped, `.${stripped}`]
}

/**
 * Set-Cookie header values that clear session cookies with `Domain=` (cross-subdomain cookies).
 */
export function buildDomainSessionCookieClearHeaderValues(
  domain: string,
  useHttps: boolean
): string[] {
  return SESSION_RELATED.map((suffix) =>
    serializeSessionCookieClear(sessionCookieName(suffix, useHttps), useHttps, domain)
  )
}

/**
 * Derives a parent "site" domain for multi-label hostnames (e.g. `test-agent.thearena.ai` →
 * `thearena.ai`). Returns `undefined` for two-label hosts or localhost. Naive; sufficient for
 * `*.thearena.*`-style deploys, not for all public suffixes (e.g. `co.uk`).
 */
export function getParentDomainFromPublicHostname(hostname: string): string | undefined {
  const parts = hostname.toLowerCase().replace(/^\./, '').split('.')
  if (parts.length < 3) {
    return undefined
  }
  return parts.slice(-2).join('.')
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * Unique `Domain=` values to expire for the given hosts: each host, its parent
 * (when 3+ labels), and leading-dot variants of both.
 */
export function collectSessionCookieDomainsToClear(hostnames: string[]): string[] {
  const domains = new Set<string>()
  for (const raw of hostnames) {
    const hostname = raw.replace(/^\./, '').toLowerCase()
    if (!hostname || isLoopbackHostname(hostname)) {
      continue
    }
    for (const variant of domainAttributeVariants(hostname)) {
      domains.add(variant)
    }
    const parent = getParentDomainFromPublicHostname(hostname)
    if (parent && parent !== hostname) {
      for (const variant of domainAttributeVariants(parent)) {
        domains.add(variant)
      }
    }
  }
  return [...domains]
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
  return buildComprehensiveSessionCookieClearHeaderValuesForHostnames([publicUrlHostname], useHttps)
}

/**
 * Same sweep as {@link buildComprehensiveSessionCookieClearHeaderValues}, unioned across
 * every hostname (request `Host` and `NEXT_PUBLIC_APP_URL` can differ).
 */
export function buildComprehensiveSessionCookieClearHeaderValuesForHostnames(
  hostnames: string[],
  useHttps: boolean
): string[] {
  const lines = [...buildHostOnlySessionCookieClearHeaderValues(useHttps)]
  for (const domain of collectSessionCookieDomainsToClear(hostnames)) {
    lines.push(...buildDomainSessionCookieClearHeaderValues(domain, useHttps))
  }
  return lines
}

/**
 * JSON response that carries every `Set-Cookie` clear as a distinct header.
 * `NextResponse` / `ResponseCookies` key cookies by name, so appending the same
 * `__Secure-better-auth.session_token` with different `Domain=` values would
 * collapse to one header and leave the leftover parent-domain token in the jar.
 */
export function createSessionCookieClearResponse(
  body: Record<string, unknown>,
  cookieHeaderValues: string[]
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: [
      ['content-type', 'application/json; charset=utf-8'],
      ['cache-control', 'no-store'],
      ...cookieHeaderValues.map((value) => ['set-cookie', value] as [string, string]),
    ],
  })
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
