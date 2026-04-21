'use client'

import { useEffect } from 'react'
import { createLogger } from '@sim/logger'
import { signOut } from '@/lib/auth/auth-client'

const logger = createLogger('AuthSessionReset')

const STORAGE_KEY = 'sim_auth_session_reset_version'

/**
 * One-time forced sign-out + reload for this deploy (e.g. cookie domain change).
 * Remove `AuthSessionResetProvider` from `app/layout.tsx` and delete this file on the next deployment.
 */
const AUTH_SESSION_RESET_VERSION = '2026-04-arena-cookie-domain'

function shouldSkipPath(pathname: string): boolean {
  // Public embeds: avoid clearing app auth for viewers who only use these routes.
  if (pathname.startsWith('/chat/') || pathname.startsWith('/form/')) {
    return true
  }
  return false
}

export function AuthSessionResetProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (shouldSkipPath(window.location.pathname)) {
      return
    }

    let stored: string | null = null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch {
      return
    }

    if (stored === AUTH_SESSION_RESET_VERSION) {
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        await signOut({
          fetchOptions: {
            credentials: 'include',
          },
        })
      } catch (error) {
        logger.warn('Auth session reset sign-out failed; still advancing marker to avoid reload loop', {
          error,
        })
      }

      if (cancelled) {
        return
      }

      try {
        localStorage.setItem(STORAGE_KEY, AUTH_SESSION_RESET_VERSION)
      } catch {
        // ignore
      }

      window.location.reload()
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return <>{children}</>
}
