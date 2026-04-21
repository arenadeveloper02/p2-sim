import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  AUTH_SESSION_RESET_QUERY_KEY,
  AUTH_SESSION_RESET_VERSION,
} from '@/app/_shell/providers/auth-session-reset-constants'
import { isAuthDisabled } from '@/lib/core/config/feature-flags'

function forwardSetCookieHeaders(from: Response, to: NextResponse) {
  const raw = from.headers.get('set-cookie')
  if (!raw) return

  const withGetSetCookie = from.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    for (const cookie of withGetSetCookie.getSetCookie()) {
      to.headers.append('Set-Cookie', cookie)
    }
    return
  }

  to.headers.append('Set-Cookie', raw)
}

/**
 * Full navigation sign-out so browsers reliably apply Set-Cookie clears (HttpOnly session).
 * Client fetch-based signOut can fail to clear cookies in some production setups.
 */
export async function GET(request: NextRequest) {
  const base = new URL(request.url)
  const nextParam = request.nextUrl.searchParams.get('next') || '/workspace'

  let target: URL
  try {
    target = new URL(nextParam, base.origin)
  } catch {
    target = new URL('/workspace', base.origin)
  }

  if (target.origin !== base.origin) {
    target = new URL('/workspace', base.origin)
  }

  target.searchParams.set(AUTH_SESSION_RESET_QUERY_KEY, AUTH_SESSION_RESET_VERSION)

  if (isAuthDisabled) {
    return NextResponse.redirect(target)
  }

  const authResponse = await auth.api.signOut({
    headers: request.headers,
    asResponse: true,
  })

  const redirect = NextResponse.redirect(target)
  forwardSetCookieHeaders(authResponse, redirect)
  return redirect
}
