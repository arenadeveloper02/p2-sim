'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { client } from '@/lib/auth/auth-client'

const AUTO_LOGIN_GRACE_MS = 3000
const SESSION_POLL_MS = 300

type SessionRequiredContentProps = {
  arenaUrl: string | undefined
  /** From request cookies — avoids hydration mismatch for initial UI */
  hasEmailCookie: boolean
}

export function SessionRequiredContent({
  arenaUrl,
  hasEmailCookie,
}: SessionRequiredContentProps) {
  const router = useRouter()
  const [showMainMessage, setShowMainMessage] = useState(!hasEmailCookie)

  useEffect(() => {
    if (!hasEmailCookie) {
      return
    }

    let cancelled = false
    const deadline = Date.now() + AUTO_LOGIN_GRACE_MS

    const pollSession = async () => {
      if (cancelled) return
      try {
        const session = await client.getSession()
        if (session?.data?.user?.id) {
          router.replace('/workspace')
          return
        }
      } catch {
        // ignore — same as AutoLoginProvider
      }
      if (Date.now() >= deadline) {
        setShowMainMessage(true)
        return
      }
      setTimeout(pollSession, SESSION_POLL_MS)
    }

    pollSession()

    return () => {
      cancelled = true
    }
  }, [hasEmailCookie, router])

  if (!showMainMessage) {
    return (
      <div className='flex min-h-screen flex-col items-center justify-center gap-4 p-8'>
        <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' aria-hidden />
        <p className='text-muted-foreground text-sm'>Signing you in…</p>
      </div>
    )
  }

  return (
    <div className='flex min-h-screen flex-col items-center justify-center gap-6 p-8'>
      <div className='flex max-w-md flex-col items-center gap-3 text-center'>
        <h1 className='font-semibold text-xl tracking-tight'>You need to sign in again</h1>
        <p className='text-muted-foreground text-sm leading-relaxed'>
          There is no active session for this app. Sign in from Arena, then open the agent again.
        </p>
      </div>
      {arenaUrl ? (
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
