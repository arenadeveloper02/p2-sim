import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import {
  assertArenaSsoCsrf,
  exchangeTicketCookie,
  extractArenaJwt,
  findSimUserByEmail,
  getArenaSsoCookieName,
  upsertTicketAndSession,
  validateArenaJwtViaAccountService,
} from '@/lib/auth/arena-sso'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

export const dynamic = 'force-dynamic'

const logger = createLogger('ArenaSsoAPI')

/**
 * POST /api/auth/arena-sso
 * Arena → Sim SSO handshake (CASA: no shared password; CSRF on cookie path).
 * - Authorisation JWT → account-service /sso/validate → createSession + ticket
 * - Else arena_sso_* cookie → ticket exchange (CSRF checked)
 */
export const POST = withRouteHandler(async (request: NextRequest) => {
  const csrf = assertArenaSsoCsrf(request)
  if (!csrf.ok) {
    return NextResponse.json({ error: csrf.error }, { status: csrf.status })
  }

  const jwt = extractArenaJwt(request.headers)
  if (jwt) {
    const validation = await validateArenaJwtViaAccountService(jwt, request.signal)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status })
    }

    const simUser = await findSimUserByEmail(validation.email)
    if (!simUser) {
      logger.warn('Arena SSO: user not in Sim', { email: validation.email })
      return NextResponse.json({ error: 'User not found in Sim' }, { status: 403 })
    }
    if (simUser.banned) {
      return NextResponse.json({ error: 'User is banned' }, { status: 403 })
    }

    try {
      const { setCookies } = await upsertTicketAndSession({
        userId: simUser.id,
        email: validation.email,
        sysId: validation.sysId,
      })
      const response = NextResponse.json({ success: true as const, email: validation.email })
      for (const c of setCookies) {
        response.headers.append('set-cookie', c)
      }
      return response
    } catch (error) {
      logger.error('Arena SSO session mint failed', { error })
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }
  }

  const cookieName = getArenaSsoCookieName()
  const rawTicket = request.cookies.get(cookieName)?.value
  if (!rawTicket) {
    return NextResponse.json({ error: 'Authorization or SSO cookie required' }, { status: 401 })
  }

  // Cookie path: require Origin when Sec-Fetch-Site is cross-site (assertArenaSsoCsrf already ran)
  const origin = request.headers.get('origin')
  const secFetchSite = request.headers.get('sec-fetch-site')?.toLowerCase()
  if (secFetchSite === 'cross-site' && !origin) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 })
  }

  const exchanged = await exchangeTicketCookie(rawTicket)
  if (!exchanged.ok) {
    return NextResponse.json({ error: exchanged.error }, { status: exchanged.status })
  }

  const response = NextResponse.json({ success: true as const })
  for (const c of exchanged.setCookies) {
    response.headers.append('set-cookie', c)
  }
  return response
})
