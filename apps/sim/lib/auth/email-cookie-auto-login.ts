import { createLogger } from '@sim/logger'
import { client } from '@/lib/auth/auth-client'

const logger = createLogger('EmailCookieAutoLogin')

/** Dev / Arena default password used with the `email` cookie for automatic sign-in. */
export const EMAIL_COOKIE_AUTO_LOGIN_PASSWORD = 'Position2!' as const

let loginInFlight = false

/**
 * Reads the `email` cookie set by upstream apps (e.g. Arena) for automatic Sim sign-in.
 */
export function getEmailCookie(): string | null {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; email=`)
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift()?.trim() || null
  }
  return null
}

/**
 * If there is no session but an `email` cookie exists, signs in with the default password.
 * Serialized with `loginInFlight` so concurrent callers (e.g. root provider + settings page) do not double-submit.
 *
 * @param callbackURL - Post-login redirect target passed to Better Auth.
 * @returns Whether sign-in completed successfully (caller may still need to `router.refresh()` / navigate).
 */
export async function attemptEmailCookieAutoLogin(callbackURL: string): Promise<boolean> {
  if (loginInFlight) {
    return false
  }

  loginInFlight = true
  try {
    const session = await client.getSession()
    if (session?.data?.user?.id) {
      return false
    }

    const emailFromCookie = getEmailCookie()
    if (!emailFromCookie) {
      return false
    }

    logger.info('Email-cookie auto-login attempt', { callbackURL })

    const result = await client.signIn.email(
      {
        email: emailFromCookie.toLowerCase(),
        password: EMAIL_COOKIE_AUTO_LOGIN_PASSWORD,
        callbackURL,
      },
      {
        onError: (ctx) => {
          logger.error('Email-cookie auto-login error:', ctx.error)
        },
      }
    )

    return Boolean(result?.data)
  } catch (error) {
    logger.error('Email-cookie auto-login exception:', error)
    return false
  } finally {
    loginInFlight = false
  }
}

/**
 * Builds the callback URL for email-cookie auto-login: preserve workspace deep links, otherwise `/workspace`.
 */
export function getEmailCookieAutoLoginCallbackURL(): string {
  if (typeof window === 'undefined') {
    return '/workspace'
  }
  const { pathname, search } = window.location
  if (pathname.startsWith('/workspace')) {
    return `${pathname}${search}`
  }
  return '/workspace'
}
