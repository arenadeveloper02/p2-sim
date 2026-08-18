'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { createLogger } from '@sim/logger'

const logger = createLogger('AutoLoginSessionMigrationProvider')

/**
 * One-time clear of leftover Better Auth session cookies across host-only,
 * `Domain=<agent host>`, and parent `Domain=thearena.ai` scopes. Needed when
 * older deploys mixed cross-subdomain and host-only `__Secure-better-auth.*`
 * cookies (same name, two Domain scopes → redirect / logout loops).
 *
 * Children (including AutoLoginProvider) mount only after the clear finishes
 * so auto-login can mint a fresh session without racing the wipe.
 *
 * Bump the localStorage key when a new clear pass is required in production.
 */
const AUTO_LOGIN_MIGRATION_KEY = 'sim_auth_session_cookie_scope_migration_v2'

interface AutoLoginSessionMigrationProviderProps {
  children: ReactNode
}

/**
 * Gates children until the one-time cookie-scope clear has completed (or was
 * already done in a prior visit).
 */
export function AutoLoginSessionMigrationProvider({
  children,
}: AutoLoginSessionMigrationProviderProps) {
  const [ready, setReady] = useState(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(AUTO_LOGIN_MIGRATION_KEY) === '1'
  })

  useEffect(() => {
    if (ready) return

    const run = async () => {
      try {
        // boundary-raw-fetch: Set-Cookie clear must hit same-origin; not a JSON contract
        const res = await fetch('/api/auth/clear-domain-session-cookies', {
          method: 'POST',
          credentials: 'include',
        })
        if (!res.ok) {
          logger.error('Session cookie scope migration clear failed', { status: res.status })
        } else if (typeof localStorage !== 'undefined') {
          localStorage.setItem(AUTO_LOGIN_MIGRATION_KEY, '1')
        }
      } catch (error) {
        logger.error('Session cookie scope migration clear failed', { error })
      } finally {
        // Always unblock the tree — a failed clear must not leave the app blank.
        setReady(true)
      }
    }

    void run()
  }, [ready])

  if (!ready) {
    return null
  }

  return <>{children}</>
}
