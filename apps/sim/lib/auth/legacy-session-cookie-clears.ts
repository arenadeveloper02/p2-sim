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
 * Whether the incoming request was made over HTTPS (for `Secure` cookie flag).
 */
export function isHttpsRequest(request: Request): boolean {
  const url = new URL(request.url)
  if (url.protocol === 'https:') {
    return true
  }
  const forwarded = request.headers.get('x-forwarded-proto')
  return forwarded === 'https'
}
