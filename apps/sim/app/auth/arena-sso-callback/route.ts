import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import {
  arenaSsoAudience,
  createArenaSsoHandoffToken,
  exchangeHandoffTokenForSetCookies,
  findSimUserIdByEmail,
  redeemArenaSsoCode,
  sanitizeReturnPath,
} from '@/lib/auth/arena-sso'
import { getBaseUrl } from '@/lib/core/utils/urls'

const logger = createLogger('ArenaSsoCallback')

function errorRedirect(reason: string): NextResponse {
  const url = new URL('/auth/arena-sso-error', getBaseUrl())
  url.searchParams.set('reason', reason)
  return NextResponse.redirect(url)
}

/**
 * Arena redirect SSO callback.
 * GET /auth/arena-sso-callback?code=…&returnPath=/workspace
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim()
  const returnPath = sanitizeReturnPath(request.nextUrl.searchParams.get('returnPath'))

  if (!code) {
    return errorRedirect('missing-code')
  }

  try {
    const aud = arenaSsoAudience()
    const redeemed = await redeemArenaSsoCode(code, aud)
    const userId = await findSimUserIdByEmail(redeemed.email)
    if (!userId) {
      logger.warn('SSO redeem ok but Sim user missing')
      return errorRedirect('missing-user')
    }

    const handoffToken = await createArenaSsoHandoffToken(userId)
    const setCookies = await exchangeHandoffTokenForSetCookies(handoffToken)

    const destination = new URL(returnPath, getBaseUrl())
    const response = NextResponse.redirect(destination)
    for (const cookie of setCookies) {
      response.headers.append('Set-Cookie', cookie)
    }
    return response
  } catch (error) {
    logger.error('Arena SSO callback failed', { error })
    return errorRedirect('redeem-failed')
  }
}
