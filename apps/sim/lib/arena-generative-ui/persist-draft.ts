import { db } from '@sim/db'
import { generativeAppDraft, generativeAppDraftRevision } from '@sim/db/schema'
import { generateId } from '@sim/utils/id'
import { filterUndefined } from '@sim/utils/object'
import { eq } from 'drizzle-orm'
import type { ArenaGenerativeStructuredBrief } from '@/lib/arena-generative-ui/structured-brief'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeAppManifest,
} from '@/lib/arena-generative-ui/types'

export interface PersistDraftInput {
  draftId?: string
  workspaceId: string
  workflowId: string
  userId: string
  title: string
  entryPath: string
  manifest: ArenaGenerativeAppManifest
  apiBindings: ArenaGenerativeApiBinding[]
  /** Original generate brief. Ordinary edits omit this so the stored brief is not replaced by a delta. Re-plan passes the new job. */
  brief?: string
  /** Generate-time structured brief. Ordinary edits omit this. Re-plan overwrites it (including `null` when planning failed). */
  structuredBrief?: ArenaGenerativeStructuredBrief | null
}

export interface PersistedDraft {
  draftId: string
  revisionId: string
  revision: number
}

/**
 * Creates a draft or appends an immutable revision when editing.
 */
export async function persistGenerativeAppDraft(input: PersistDraftInput): Promise<PersistedDraft> {
  const now = new Date()

  if (!input.draftId) {
    const draftId = generateId()
    const revisionId = generateId()
    await db.insert(generativeAppDraft).values({
      id: draftId,
      workspaceId: input.workspaceId,
      workflowId: input.workflowId,
      userId: input.userId,
      title: input.title,
      entryPath: input.entryPath,
      revision: 1,
      brief: input.brief ?? null,
      structuredBrief: input.structuredBrief ?? null,
      manifest: input.manifest,
      apiBindings: input.apiBindings,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(generativeAppDraftRevision).values({
      id: revisionId,
      draftId,
      revision: 1,
      title: input.title,
      entryPath: input.entryPath,
      manifest: input.manifest,
      apiBindings: input.apiBindings,
      createdAt: now,
    })
    return { draftId, revisionId, revision: 1 }
  }

  const [existing] = await db
    .select({
      id: generativeAppDraft.id,
      revision: generativeAppDraft.revision,
    })
    .from(generativeAppDraft)
    .where(eq(generativeAppDraft.id, input.draftId))
    .limit(1)

  if (!existing) {
    throw new Error('Draft not found')
  }

  const nextRevision = existing.revision + 1
  const revisionId = generateId()

  await db
    .update(generativeAppDraft)
    .set(
      filterUndefined({
        title: input.title,
        entryPath: input.entryPath,
        revision: nextRevision,
        manifest: input.manifest,
        apiBindings: input.apiBindings,
        brief: input.brief,
        structuredBrief: input.structuredBrief,
        updatedAt: now,
      })
    )
    .where(eq(generativeAppDraft.id, existing.id))

  await db.insert(generativeAppDraftRevision).values({
    id: revisionId,
    draftId: existing.id,
    revision: nextRevision,
    title: input.title,
    entryPath: input.entryPath,
    manifest: input.manifest,
    apiBindings: input.apiBindings,
    createdAt: now,
  })

  return { draftId: existing.id, revisionId, revision: nextRevision }
}
