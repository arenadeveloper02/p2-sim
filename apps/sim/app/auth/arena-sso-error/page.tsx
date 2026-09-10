import Link from 'next/link'
import { getArenaHubAgentsUrl } from '@/lib/core/utils/urls'

const REASON_COPY: Record<string, string> = {
  'missing-code': 'The sign-in link was incomplete. Return to Arena and try again.',
  'missing-user':
    'Your Arena account is not provisioned in Agents yet. Contact an admin to finish setup.',
  'redeem-failed': 'Sign-in could not be completed. Return to Arena and try again.',
}

export default async function ArenaSsoErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const params = await searchParams
  const reason = params.reason ?? 'redeem-failed'
  const message = REASON_COPY[reason] ?? REASON_COPY['redeem-failed']
  const arenaAgentsUrl = getArenaHubAgentsUrl()

  return (
    <main className='mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-6 py-16'>
      <h1 className='font-semibold text-2xl tracking-tight'>Could not open Agents</h1>
      <p className='text-muted-foreground text-sm leading-relaxed'>{message}</p>
      {arenaAgentsUrl ? (
        <Link className='text-sm underline underline-offset-4' href={arenaAgentsUrl}>
          Back to Arena agents
        </Link>
      ) : (
        <Link className='text-sm underline underline-offset-4' href='/'>
          Back to home
        </Link>
      )}
    </main>
  )
}
