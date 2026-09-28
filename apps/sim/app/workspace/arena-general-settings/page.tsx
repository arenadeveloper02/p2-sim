import { Suspense } from 'react'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/app/_shell/providers/get-query-client'
import { prefetchGeneralSettings } from '@/app/workspace/[workspaceId]/settings/[section]/prefetch'
import { General } from '@/app/workspace/[workspaceId]/settings/components/general/general'

/**
 * Arena copy of General settings. Profile and preferences are user-scoped, so
 * this page lives at `/workspace/arena-general-settings` and does not take a
 * workspace id. The workspace `/settings/general` page is unchanged.
 */
export default async function ArenaGeneralSettingsPage() {
  const queryClient = getQueryClient()
  await prefetchGeneralSettings(queryClient)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={null}>
        <General hideProfile />
      </Suspense>
    </HydrationBoundary>
  )
}
