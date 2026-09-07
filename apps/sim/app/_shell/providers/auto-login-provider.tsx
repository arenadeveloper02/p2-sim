'use client'

import { useEffect, useRef } from 'react'
import { createLogger } from '@sim/logger'
import { useRouter } from 'next/navigation'
import { attemptArenaSso } from '@/lib/auth/attempt-arena-sso'
import { client } from '@/lib/auth/auth-client'

const logger = createLogger('AutoLoginProvider')

/**
 * CASA 1.2.1: silent re-auth via arena-sso ticket cookie only — never a shared password.
 */
export function AutoLoginProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const hasAttemptedAutoLogin = useRef(false)

  useEffect(() => {
    if (hasAttemptedAutoLogin.current) {
      return
    }

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (
        params.get('from') === 'arena_v3' &&
        window.location.pathname.includes('/settings/integrations')
      ) {
        return
      }
    }

    const attemptAutoLogin = async () => {
      try {
        const session = await client.getSession()
        if (session?.data?.user?.id) {
          return
        }

        const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
        const stayOnCurrentPath = pathname.includes('/embed') || pathname.startsWith('/chat/')

        logger.info('Attempting Arena SSO (no shared password)', { stayOnCurrentPath })
        const { ok } = await attemptArenaSso()
        if (ok) {
          logger.info('Arena SSO silent login successful', { stayOnCurrentPath })
          if (!stayOnCurrentPath) {
            router.push('/workspace')
          }
          router.refresh()
        }
      } catch (error) {
        logger.error('Error during Arena SSO attempt:', error)
      } finally {
        hasAttemptedAutoLogin.current = true
      }
    }

    const timeoutId = setTimeout(() => {
      void attemptAutoLogin()
    }, 50)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [router])

  return <>{children}</>
}
