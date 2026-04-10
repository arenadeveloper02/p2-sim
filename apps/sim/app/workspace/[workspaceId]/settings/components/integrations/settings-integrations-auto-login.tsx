'use client'

import { useEffect, useRef } from 'react'
import { createLogger } from '@sim/logger'
import { useRouter } from 'next/navigation'
import {
  attemptEmailCookieAutoLogin,
  getEmailCookieAutoLoginCallbackURL,
} from '@/lib/auth/email-cookie-auto-login'

const logger = createLogger('SettingsIntegrationsAutoLogin')

/**
 * Runs email-cookie auto-login when viewing workspace Integrations settings (e.g. embedded iframe).
 * Shares serialization with {@link attemptEmailCookieAutoLogin} so the root {@link AutoLoginProvider} does not double-submit.
 */
export function SettingsIntegrationsAutoLogin() {
  const router = useRouter()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) {
      return
    }
    ran.current = true

    const run = async () => {
      const callbackURL = getEmailCookieAutoLoginCallbackURL()
      const ok = await attemptEmailCookieAutoLogin(callbackURL)
      if (ok) {
        logger.info('Integrations settings auto-login successful')
        router.push(callbackURL)
        router.refresh()
      }
    }

    void run()
  }, [router])

  return null
}
