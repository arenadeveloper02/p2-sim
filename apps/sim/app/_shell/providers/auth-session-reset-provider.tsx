'use client'

import { useEffect } from 'react'
import {
  AUTH_SESSION_RESET_QUERY_KEY,
  AUTH_SESSION_RESET_STORAGE_KEY,
  AUTH_SESSION_RESET_VERSION,
} from '@/app/_shell/providers/auth-session-reset-constants'

/**
 * One-time forced sign-out for this deploy (e.g. cookie domain change).
 * Uses a **full navigation** to `/api/auth/session-migration-sign-out` so HttpOnly cookies clear reliably.
 * Remove `AuthSessionResetProvider` from `app/layout.tsx`, delete this file, the constants file,
 * and `app/api/auth/session-migration-sign-out/route.ts` on the next deployment.
 */
function shouldSkipPath(pathname: string): boolean {
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

    const params = new URLSearchParams(window.location.search)
    if (params.get(AUTH_SESSION_RESET_QUERY_KEY) === AUTH_SESSION_RESET_VERSION) {
      try {
        localStorage.setItem(AUTH_SESSION_RESET_STORAGE_KEY, AUTH_SESSION_RESET_VERSION)
      } catch {
        // ignore
      }
      params.delete(AUTH_SESSION_RESET_QUERY_KEY)
      const qs = params.toString()
      const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
      window.history.replaceState({}, '', nextUrl)
      return
    }

    let stored: string | null = null
    try {
      stored = localStorage.getItem(AUTH_SESSION_RESET_STORAGE_KEY)
    } catch {
      return
    }

    if (stored === AUTH_SESSION_RESET_VERSION) {
      return
    }

    const next = `${window.location.pathname}${window.location.search}`
    const migrationUrl = `/api/auth/session-migration-sign-out?${new URLSearchParams({ next }).toString()}`
    window.location.replace(migrationUrl)
  }, [])

  return <>{children}</>
}
