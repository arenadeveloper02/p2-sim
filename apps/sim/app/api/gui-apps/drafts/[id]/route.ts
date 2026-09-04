import { db } from '@sim/db'
import { generativeAppDraft, generativeAppDraftRevision } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { and, desc, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { getGenerativeAppDraftContract } from '@/lib/api/contracts/arena-generative-apps'
import { parseRequest } from '@/lib/api/server'
import { pageSummariesFromManifest } from '@/lib/arena-generative-ui/deployment'
import {
  parseStoredAdoptedChanges,
  parseStoredGenerateWarnings,
} from '@/lib/arena-generative-ui/generate-warnings'
import { summarizeManifestDiff } from '@/lib/arena-generative-ui/manifest-diff'
import { parseApiBindings } from '@/lib/arena-generative-ui/parse-inputs'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'
import {
  formatVisualBriefMatchNotes,
  parseStoredVisualBrief,
} from '@/lib/arena-generative-ui/visual-brief'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { checkWorkflowAccessForChatCreation } from '@/app/api/chat/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('GenerativeAppDraftAPI')

function screenshotMatchNotesFromDraft(storedBrief: unknown): string | null {
  const visualBrief = parseStoredVisualBrief(storedBrief)
  if (!visualBrief) return null
  const notes = formatVisualBriefMatchNotes(visualBrief)
  return notes.trim() ? notes : null
}

export const GET = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return createErrorResponse('Unauthorized', 401)
    }

    const parsed = await parseRequest(getGenerativeAppDraftContract, request, context)
    if (!parsed.success) return parsed.response

    try {
      const [draft] = await db
        .select()
        .from(generativeAppDraft)
        .where(eq(generativeAppDraft.id, parsed.data.params.id))
        .limit(1)

      if (!draft) {
        return createErrorResponse('Draft not found', 404)
      }

      const { hasAccess } = await checkWorkflowAccessForChatCreation(
        draft.workflowId,
        session.user.id
      )
      if (!hasAccess) {
        return createErrorResponse('Draft not found or access denied', 404)
      }

      const [latest] = await db
        .select({ id: generativeAppDraftRevision.id })
        .from(generativeAppDraftRevision)
        .where(
          and(
            eq(generativeAppDraftRevision.draftId, draft.id),
            eq(generativeAppDraftRevision.revision, draft.revision)
          )
        )
        .orderBy(desc(generativeAppDraftRevision.createdAt))
        .limit(1)

      const manifest = draft.manifest as ArenaGenerativeAppManifest
      let revisionDiff = null
      if (draft.revision > 1) {
        const [previous] = await db
          .select({
            manifest: generativeAppDraftRevision.manifest,
            revision: generativeAppDraftRevision.revision,
          })
          .from(generativeAppDraftRevision)
          .where(
            and(
              eq(generativeAppDraftRevision.draftId, draft.id),
              eq(generativeAppDraftRevision.revision, draft.revision - 1)
            )
          )
          .limit(1)
        revisionDiff = summarizeManifestDiff(
          previous?.manifest as ArenaGenerativeAppManifest | undefined,
          manifest,
          draft.revision - 1,
          draft.revision
        )
      }

      return createSuccessResponse({
        id: draft.id,
        title: draft.title,
        entryPath: draft.entryPath,
        revision: draft.revision,
        workflowId: draft.workflowId,
        latestRevisionId: latest?.id ?? null,
        pages: pageSummariesFromManifest(manifest),
        apiBindings: parseApiBindings(draft.apiBindings),
        manifest,
        revisionDiff,
        brief: draft.brief ?? null,
        screenshotMatchNotes: screenshotMatchNotesFromDraft(draft.structuredBrief),
        generateWarnings: parseStoredGenerateWarnings(draft.structuredBrief),
        adoptedChanges: parseStoredAdoptedChanges(draft.structuredBrief),
      })
    } catch (error) {
      logger.error('Failed to load generative app draft', { error: getErrorMessage(error) })
      return createErrorResponse(getErrorMessage(error, 'Failed to load draft'), 500)
    }
  }
)
