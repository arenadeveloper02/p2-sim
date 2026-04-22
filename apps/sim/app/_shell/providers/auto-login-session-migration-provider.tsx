'use client'

import { useEffect } from 'react'
import { createLogger } from '@sim/logger'

const logger = createLogger('AutoLoginSessionMigrationProvider')

/**
 * @deprecated One-time migration for next deploy only — remove this component and this file
 * from `app/layout.tsx` after the migration window. Clears cross-scope session cookies before
 * auto-login when an `email` cookie is present, then marks the run in localStorage.
 */
const AUTO_LOGIN_MIGRATION_KEY = 'sim_auth_auto_login_migration_v1'

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
 * Renders nothing. Mount as a child of `AutoLoginProvider` (before other children) so this
 * effect runs before the parent auto-login `useEffect` schedules the 50ms sign-in.
 */
export function AutoLoginSessionMigrationProvider() {
  useEffect(() => {
    const run = async () => {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(AUTO_LOGIN_MIGRATION_KEY)) {
        return
      }

      if (!getCookie('email')) {
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
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(AUTO_LOGIN_MIGRATION_KEY, '1')
        }
      } catch (error) {
        logger.error('One-time session cookie clear before auto-login failed:', error)
      }
    }

    void run()
  }, [])

  return null
}
