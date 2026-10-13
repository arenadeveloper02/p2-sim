'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { buildArenaSimResumeUrl } from '@/lib/auth/arena-sim-resume'

type SessionRequiredContentProps = {
  arenaUrl: string | undefined
  /** Preferred post-SSO destination (same-origin app URL). */
  returnTo?: string
}

/**
 * Hard-navigates to Arena `/sso/sim-resume` when the hub is configured.
 * Used after same-origin redirects from RSC/prefetch (which must not bounce
 * cross-origin themselves).
 */
function resolveResumeHref(arenaUrl: string | undefined, returnTo: string | undefined): string | null {
  const destination =
    returnTo && returnTo.length > 0
      ? returnTo
      : typeof window !== 'undefined'
        ? window.location.origin
        : null
  if (!destination) return null

  const hostname = typeof window !== 'undefined' ? window.location.hostname : undefined
  const resume = buildArenaSimResumeUrl(destination, hostname)
  if (resume) return resume.href
  return arenaUrl?.trim() || null
}

export function SessionRequiredContent({ arenaUrl, returnTo }: SessionRequiredContentProps) {
  const [resumeHref, setResumeHref] = useState<string | null>(null)

  useEffect(() => {
    const href = resolveResumeHref(arenaUrl, returnTo)
    setResumeHref(href)
    if (href) {
      window.location.replace(href)
    }
  }, [arenaUrl, returnTo])

  return (
    <div className='flex min-h-screen flex-col items-center justify-center gap-6 p-8'>
      <div className='flex max-w-md flex-col items-center gap-3 text-center'>
        <h1 className='font-semibold text-xl tracking-tight'>You need to sign in again</h1>
        <p className='text-muted-foreground text-sm leading-relaxed'>
          {resumeHref
            ? 'Redirecting you to Arena to sign in…'
            : 'There is no active session for this app. Sign in from Arena, then open the agent again.'}
        </p>
      </div>
      {resumeHref ? (
        <Button asChild variant='default'>
          <a href={resumeHref} rel='noopener noreferrer'>
            Continue to Arena
          </a>
        </Button>
      ) : arenaUrl ? (
        <Button asChild variant='default'>
          <a href={arenaUrl} rel='noopener noreferrer'>
            Back to Arena
          </a>
        </Button>
      ) : (
        <p className='text-muted-foreground text-xs'>
          Configure{' '}
          <code className='rounded bg-muted px-1 py-0.5'>NEXT_PUBLIC_ARENA_FRONTEND_APP_URL</code>{' '}
          to enable the return link.
        </p>
      )}
    </div>
  )
}
