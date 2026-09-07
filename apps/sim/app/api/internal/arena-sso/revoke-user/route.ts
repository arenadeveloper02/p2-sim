import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { revokeAllForEmail } from '@/lib/auth/arena-sso'
import { env } from '@/lib/core/config/env'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

export const dynamic = 'force-dynamic'

const logger = createLogger('ArenaSsoRevokeAPI')

/**
 * POST /api/internal/arena-sso/revoke-user
 * Called by account-service after password change (CASA 2.2.2).
 * Auth: X-Arena-Sso-Revoke-Secret shared secret.
 */
export const POST = withRouteHandler(async (request: NextRequest) => {
  const expected = env.ARENA_SSO_REVOKE_SECRET?.trim()
  if (!expected) {
    logger.error('ARENA_SSO_REVOKE_SECRET is not configured')
    return NextResponse.json({ error: 'Revoke endpoint not configured' }, { status: 503 })
  }

  const provided = request.headers.get('x-arena-sso-revoke-secret')?.trim()
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { email?: string }
  try {
    body = (await request.json()) as { email?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = body.email?.trim()
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const result = await revokeAllForEmail(email)
  return NextResponse.json({ success: true as const, ...result })
})
