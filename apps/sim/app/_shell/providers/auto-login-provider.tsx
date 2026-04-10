'use client'

import { useEffect, useRef } from 'react'
import { createLogger } from '@sim/logger'
import { useRouter } from 'next/navigation'
import {
  attemptEmailCookieAutoLogin,
  getEmailCookieAutoLoginCallbackURL,
} from '@/lib/auth/email-cookie-auto-login'

const logger = createLogger('AutoLoginProvider')

/**
 * Auto-login provider that checks for email cookie and automatically logs in
 * if there's no active session
 */
export function AutoLoginProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const hasAttemptedAutoLogin = useRef(false)

  useEffect(() => {
    // Only attempt auto-login once per mount
    if (hasAttemptedAutoLogin.current) {
      return
    }

    const attemptAutoLogin = async () => {
      try {
        const callbackURL = getEmailCookieAutoLoginCallbackURL()
        const ok = await attemptEmailCookieAutoLogin(callbackURL)

        if (ok) {
          logger.info('Auto-login successful')
          router.push(callbackURL)
          router.refresh()
        }
      } catch (error) {
        logger.error('Error during auto-login attempt:', error)
      } finally {
        hasAttemptedAutoLogin.current = true
      }
    }

    // Small delay to ensure session provider has initialized
    // Reduced delay for faster auto-login on redirects
    const timeoutId = setTimeout(() => {
      void attemptAutoLogin()
    }, 50)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [router])

  return <>{children}</>
}
