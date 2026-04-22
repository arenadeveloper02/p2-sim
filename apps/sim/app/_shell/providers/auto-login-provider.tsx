'use client'

import { useEffect, useRef } from 'react'
import { createLogger } from '@sim/logger'
import { useRouter } from 'next/navigation'
import { client } from '@/lib/auth/auth-client'

const logger = createLogger('AutoLoginProvider')

/** Set after a one-time sign-out so we do not call sign out / forced re-sign-in again. */
const AUTO_LOGIN_MIGRATION_KEY = 'sim_auth_auto_login_migration_v1'

/**
 * Helper function to get a cookie value by name
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null
  }
  return null
}

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
        if (typeof localStorage !== 'undefined' && localStorage.getItem(AUTO_LOGIN_MIGRATION_KEY)) {
          return
        }

        const emailFromCookie = getCookie('email')
        if (!emailFromCookie) {
          return
        }

        try {
          const res = await fetch('/api/auth/clear-domain-session-cookies', {
            method: 'POST',
            credentials: 'include',
          })
          if (!res.ok) {
            logger.error('One-time session cookie clear before auto-login failed:', res.status)
            return
          }
        } catch (error) {
          logger.error('One-time session cookie clear before auto-login failed:', error)
          return
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(AUTO_LOGIN_MIGRATION_KEY, '1')
        }

        const session = await client.getSession()
        if (session?.data?.user?.id) {
          return
        }

        logger.info('Auto-login attempt with email from cookie')

        // Auto-login with email from cookie and password "Position2!"
        // Always redirect to workspace after successful login
        const result = await client.signIn.email(
          {
            email: emailFromCookie.trim().toLowerCase(),
            password: 'Position2!',
            callbackURL: '/workspace',
          },
          {
            onError: (ctx) => {
              logger.error('Auto-login error:', ctx.error)
              // Silently fail - don't show error to user, let them login manually
            },
          }
        )

        if (result?.data) {
          // Login successful
          logger.info('Auto-login successful')
          // Immediately redirect to workspace
          router.push('/workspace')
          // Also refresh to ensure session is properly loaded
          router.refresh()
        }
      } catch (error) {
        logger.error('Error during auto-login attempt:', error)
        // Silently fail - don't show error to user
      } finally {
        hasAttemptedAutoLogin.current = true
      }
    }

    // Small delay to ensure session provider has initialized
    // Reduced delay for faster auto-login on redirects
    const timeoutId = setTimeout(() => {
      attemptAutoLogin()
    }, 50)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [router])

  return <>{children}</>
}
