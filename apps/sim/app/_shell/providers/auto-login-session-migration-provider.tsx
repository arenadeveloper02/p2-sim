'use client'

import { useEffect } from 'react'
import { createLogger } from '@sim/logger'

const logger = createLogger('AutoLoginSessionMigrationProvider')

/**
 * One-time clear of leftover Better Auth session cookies across host-only,
 * `Domain=<agent host>`, and parent `Domain=thearena.ai` scopes. Needed when
 * older deploys mixed cross-subdomain and host-only `__Secure-better-auth.*`
 * cookies (same name, two Domain scopes → redirect / logout loops).
 *
 * Bump the localStorage key when a new clear pass is required in production.
 */
const AUTO_LOGIN_MIGRATION_KEY = 'sim_auth_session_cookie_scope_migration_v2'

/**
 * Renders nothing. Mount early in the root layout so the clear runs before
 * session/auto-login flows read conflicting cookies.
 */
export function AutoLoginSessionMigrationProvider() {
  useEffect(() => {
    const run = async () => {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(AUTO_LOGIN_MIGRATION_KEY)) {
        return
      }

      try {
        // boundary-raw-fetch: Set-Cookie clear must hit same-origin; not a JSON contract
        const res = await fetch('/api/auth/clear-domain-session-cookies', {
          method: 'POST',
          credentials: 'include',
        })
        if (!res.ok) {
          logger.error('Session cookie scope migration clear failed', { status: res.status })
          return
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(AUTO_LOGIN_MIGRATION_KEY, '1')
        }
      } catch (error) {
        logger.error('Session cookie scope migration clear failed', { error })
      }
    }

    void run()
  }, [])

  return null
}
