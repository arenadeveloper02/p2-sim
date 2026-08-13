import { db } from '@sim/db'
import { generativeAppDraft } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { ARENA_GENERATIVE_APP_PREVIEW_BASE_PATH } from '@/lib/arena-generative-ui/types'
import { getSession } from '@/lib/auth'
import { isDev } from '@/lib/core/config/env-flags'
import { GenerativeAppPreviewHost } from '@/app/(interfaces)/gui-apps/preview/[draftId]/generative-app-preview-host'
import { checkWorkflowAccessForChatCreation } from '@/app/api/chat/utils'

export const dynamic = 'force-dynamic'

export default async function GenerativeAppPreviewPage({
  params,
}: {
  params: Promise<{ draftId: string; path?: string[] }>
}) {
  const session = await getSession()
  if (!session?.user?.id) {
    redirect(isDev ? '/login' : '/session-required')
  }

  const { draftId, path } = await params
  const [draft] = await db
    .select({
      workflowId: generativeAppDraft.workflowId,
      entryPath: generativeAppDraft.entryPath,
    })
    .from(generativeAppDraft)
    .where(eq(generativeAppDraft.id, draftId))
    .limit(1)

  if (!draft) {
    return (
      <div className='flex min-h-[50vh] items-center justify-center p-8 text-center'>
        Draft not found
      </div>
    )
  }

  const { hasAccess } = await checkWorkflowAccessForChatCreation(draft.workflowId, session.user.id)
  if (!hasAccess) {
    return (
      <div className='flex min-h-[50vh] items-center justify-center p-8 text-center'>
        Draft not found
      </div>
    )
  }

  const requested = path?.[0]
  if (!requested) {
    redirect(`${ARENA_GENERATIVE_APP_PREVIEW_BASE_PATH}/${draftId}/${draft.entryPath || 'home'}`)
  }

  return <GenerativeAppPreviewHost draftId={draftId} pagePath={requested} />
}
