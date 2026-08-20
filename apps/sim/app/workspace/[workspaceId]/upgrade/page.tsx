import { Suspense } from 'react'
import type { Metadata } from 'next'
import { CREDITS_PER_DOLLAR } from '@/lib/billing/constants'
import { getFreeTierLimit } from '@/lib/billing/subscriptions/utils'
import { ArenaMaxUpgrade } from '@/app/workspace/[workspaceId]/upgrade/arena-max-upgrade'

export const metadata: Metadata = { title: 'Upgrade' }

function formatFreeCreditsLabel(): string {
  const credits = Math.round(getFreeTierLimit() * CREDITS_PER_DOLLAR)
  return `${credits.toLocaleString('en-US')} credits`
}

export default async function UpgradePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const freeCreditsLabel = formatFreeCreditsLabel()

  return (
    <Suspense fallback={<div className='h-full bg-[var(--bg)]' />}>
      <ArenaMaxUpgrade workspaceId={workspaceId} freeCreditsLabel={freeCreditsLabel} />
    </Suspense>
  )
}
