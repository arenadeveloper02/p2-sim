'use client'

import { useEffect } from 'react'
import { resolveBrowserSessionResumeHref } from '@/lib/auth/arena-sim-resume'

/**
 * Same-origin landing for an unauthenticated Next.js flight request.
 * A document navigation to Arena avoids the cross-origin preflight that a
 * middleware 302 on `?_rsc=` would trigger.
 */
export default function ArenaSsoRedirectPage() {
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('returnTo')?.trim()
    let returnTo = window.location.origin
    if (raw) {
      try {
        const target = new URL(raw)
        if (target.origin === window.location.origin) returnTo = target.href
      } catch {
        // Ignore a malformed returnTo and resume at this origin.
      }
    }
    const href = resolveBrowserSessionResumeHref(returnTo, {
      isDev: process.env.NODE_ENV === 'development',
      hostname: window.location.hostname,
    })
    window.location.replace(href)
  }, [])

  return (
    <main className='mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-3 px-6 py-16'>
      <h1 className='font-semibold text-2xl tracking-tight'>Signing you in</h1>
      <p className='text-muted-foreground text-sm leading-relaxed'>
        Taking you to Arena to continue.
      </p>
    </main>
  )
}
