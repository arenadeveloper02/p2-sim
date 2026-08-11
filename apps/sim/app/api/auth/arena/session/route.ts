import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { createArenaSessionContract } from '@/lib/api/contracts/arena-auth'
import { parseRequest } from '@/lib/api/server'
import { auth } from '@/lib/auth'
import {
  ARENA_SHARED_SIGN_IN_PASSWORD,
  resolveArenaTokenFromHeaders,
  validateArenaAuthToken,
} from '@/lib/auth/arena-session'
import { enforceIpRateLimit } from '@/lib/core/rate-limiter'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

export const dynamic = 'force-dynamic'

const logger = createLogger('ArenaSessionAPI')

/**
 * Forwards `Set-Cookie` values from a Better Auth response onto the Next response.
 */
function appendSetCookies(from: Headers, to: Headers): void {
  const withGetSetCookie = from as Headers & { getSetCookie?: () => string[] }
  for (const cookie of withGetSetCookie.getSetCookie?.() ?? []) {
    to.append('set-cookie', cookie)
  }
}

/**
 * Validates an Arena JWT, then signs into Better Auth with the returned email
 * and the shared Arena password so session cookies are set on the agent host.
 */
export const POST = withRouteHandler(async (request: NextRequest) => {
  const rateLimited = await enforceIpRateLimit('arena-auth-session', request, {
    maxTokens: 10,
    refillRate: 10,
    refillIntervalMs: 60_000,
  })
  if (rateLimited) return rateLimited

  const parsed = await parseRequest(createArenaSessionContract, request, {})
  if (!parsed.success) return parsed.response

  const token = resolveArenaTokenFromHeaders(parsed.data.headers)
  if (!token) {
    return NextResponse.json({ error: 'Authorization header is required' }, { status: 400 })
  }

  const validation = await validateArenaAuthToken(token, request.signal)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status })
  }

  try {
    const signInResponse = await auth.api.signInEmail({
      body: {
        email: validation.email,
        password: ARENA_SHARED_SIGN_IN_PASSWORD,
      },
      asResponse: true,
    })

    if (!signInResponse.ok) {
      const errorBody = (await signInResponse.json().catch(() => null)) as {
        message?: string
      } | null
      logger.warn('Better Auth sign-in failed after Arena token validation', {
        email: validation.email,
        status: signInResponse.status,
        message: errorBody?.message,
      })
      return NextResponse.json(
        { error: errorBody?.message || 'Sign in failed' },
        { status: signInResponse.status === 401 ? 401 : 500 }
      )
    }

    const response = NextResponse.json({
      success: true as const,
      email: validation.email,
    })
    appendSetCookies(signInResponse.headers, response.headers)
    logger.info('Arena session created', { email: validation.email })
    return response
  } catch (error) {
    logger.error('Unexpected error creating Arena session', {
      email: validation.email,
      error: getErrorMessage(error),
    })
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
})
