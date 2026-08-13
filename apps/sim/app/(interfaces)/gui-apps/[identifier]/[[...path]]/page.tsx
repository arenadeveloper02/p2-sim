import { db } from '@sim/db'
import { deployedApp } from '@sim/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import {
  ARENA_ACCESS_DENIED_MESSAGE,
  getArenaEmailIdFromRequest,
  persistArenaEmailIdCookie,
} from '@/lib/arena-generative-ui/email-gate'
import { ARENA_GENERATIVE_APP_BASE_PATH } from '@/lib/arena-generative-ui/types'
import { GenerativeAppHost } from '@/app/(interfaces)/gui-apps/[identifier]/generative-app-host'

export const dynamic = 'force-dynamic'

export default async function GenerativeAppPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string; path?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { identifier, path } = await params
  const query = await searchParams
  const [deployment] = await db
    .select({
      requireArenaEmailId: deployedApp.requireArenaEmailId,
      isActive: deployedApp.isActive,
      manifest: deployedApp.manifest,
    })
    .from(deployedApp)
    .where(and(eq(deployedApp.identifier, identifier), isNull(deployedApp.archivedAt)))
    .limit(1)

  if (!deployment || !deployment.isActive) {
    return (
      <div className='flex min-h-[50vh] items-center justify-center p-8 text-center'>
        This app is currently unavailable
      </div>
    )
  }

  const { emailId, fromQuery } = await getArenaEmailIdFromRequest({
    emailId: query.emailId,
  })

  if (deployment.requireArenaEmailId && !emailId) {
    return (
      <div className='flex min-h-[50vh] items-center justify-center p-8 text-center'>
        {ARENA_ACCESS_DENIED_MESSAGE}
      </div>
    )
  }

  if (fromQuery && emailId) {
    await persistArenaEmailIdCookie(emailId)
  }

  const manifest = deployment.manifest as { entryPath?: string; pages?: Record<string, unknown> }
  const entryPath = manifest.entryPath || 'home'
  const requested = path?.[0]
  if (!requested) {
    const emailQuery = emailId ? `?emailId=${encodeURIComponent(emailId)}` : ''
    redirect(`${ARENA_GENERATIVE_APP_BASE_PATH}/${identifier}/${entryPath}${emailQuery}`)
  }

  return <GenerativeAppHost identifier={identifier} pagePath={requested} emailId={emailId} />
}
