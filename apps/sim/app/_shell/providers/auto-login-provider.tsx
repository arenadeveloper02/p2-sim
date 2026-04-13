'use client'

import { useEffect, useRef } from 'react'
import { createLogger } from '@sim/logger'
import { useRouter } from 'next/navigation'
import { client } from '@/lib/auth/auth-client'

const logger = createLogger('AutoLoginProvider')

/**
 * Returns where the user should land after email cookie sign-in.
 * Workspace deep links (e.g. settings → integrations) are preserved; other routes default to `/workspace`.
 */
function getPostAutoLoginDestination(): { callbackURL: string; routerPath: string } {
  if (typeof window === 'undefined') {
    return { callbackURL: '/workspace', routerPath: '/workspace' }
  }
  const { pathname, search, origin, href } = window.location
  if (pathname.startsWith('/workspace')) {
    return { callbackURL: href, routerPath: `${pathname}${search}` }
  }
  return { callbackURL: `${origin}/workspace`, routerPath: '/workspace' }
}

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
        // Check if there's an active session
        const session = await client.getSession()
        if (session?.data?.user?.id) {
          // Session exists, no need to auto-login
          return
        }

        // No session, check for email cookie
        const emailFromCookie = getCookie('email')
        if (!emailFromCookie) {
          // No email cookie, nothing to do
          return
        }

        logger.info('Auto-login attempt with email from cookie')

        const { callbackURL, routerPath } = getPostAutoLoginDestination()

        // Auto-login with email from cookie and password "Position2!"
        const result = await client.signIn.email(
          {
            email: emailFromCookie.trim().toLowerCase(),
            password: 'Position2!',
            callbackURL,
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
          router.push(routerPath)
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
