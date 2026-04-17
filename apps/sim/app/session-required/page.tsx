import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { getEnv } from '@/lib/core/config/env'

export const metadata: Metadata = {
  title: 'Sign in required',
}

export const dynamic = 'force-dynamic'

export default function SessionRequiredPage() {
  const arenaUrl = getEnv('NEXT_PUBLIC_ARENA_FRONTEND_APP_URL')?.trim()

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
