import { db } from '@sim/db'
import { generativeAppDraft, generativeAppDraftRevision } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { and, desc, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import {
  getGenerativeAppDraftContract,
  patchGenerativeAppDraftContract,
} from '@/lib/api/contracts/arena-generative-apps'
import { parseRequest } from '@/lib/api/server'
import {
  applyIaPreset,
  patchComposition,
  plannedPlaceholderManifest,
  productContractFromBrief,
} from '@/lib/arena-generative-ui/composition'
import { pageSummariesFromManifest } from '@/lib/arena-generative-ui/deployment'
import {
  parseStoredAdoptedChanges,
  parseStoredGenerateWarnings,
} from '@/lib/arena-generative-ui/generate-warnings'
import { summarizeManifestDiff } from '@/lib/arena-generative-ui/manifest-diff'
import { parseApiBindings } from '@/lib/arena-generative-ui/parse-inputs'
import { persistGenerativeAppDraft } from '@/lib/arena-generative-ui/persist-draft'
import { parseStoredStructuredBrief } from '@/lib/arena-generative-ui/structured-brief'
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

function screenshotGapsFromDraft(
  storedBrief: unknown
): Array<{ observed: string; closestCatalogType?: string }> {
  const visualBrief = parseStoredVisualBrief(storedBrief)
  if (!visualBrief) return []
  return visualBrief.unrepresentable.map((gap) => ({
    observed: gap.observed,
    ...(gap.closestCatalogType ? { closestCatalogType: gap.closestCatalogType } : {}),
  }))
}

function productContractFields(storedBrief: unknown) {
  const brief = parseStoredStructuredBrief(storedBrief)
  const contract = productContractFromBrief(brief, storedBrief)
  return {
    planStatus: contract.planStatus,
    ...(contract.composition ? { composition: contract.composition } : {}),
    compositionIssues: contract.compositionIssues,
    plannedPages: contract.pages,
    plannedActions: contract.actions,
    capabilities: contract.capabilities,
  }
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
        screenshotGaps: screenshotGapsFromDraft(draft.structuredBrief),
        ...productContractFields(draft.structuredBrief),
      })
    } catch (error) {
      logger.error('Failed to load generative app draft', { error: getErrorMessage(error) })
      return createErrorResponse(getErrorMessage(error, 'Failed to load draft'), 500)
    }
  }
)

export const PATCH = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return createErrorResponse('Unauthorized', 401)
    }

    const parsed = await parseRequest(patchGenerativeAppDraftContract, request, context)
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

      const existingBrief = parseStoredStructuredBrief(draft.structuredBrief)
      if (!existingBrief) {
        return createErrorResponse('Draft has no plan to adjust', 400)
      }

      let nextBrief = existingBrief
      if (parsed.data.body.iaPreset) {
        nextBrief = applyIaPreset(nextBrief, parsed.data.body.iaPreset)
      }
      if (parsed.data.body.composition) {
        nextBrief = patchComposition(nextBrief, parsed.data.body.composition)
      }

      await persistGenerativeAppDraft({
        draftId: draft.id,
        workspaceId: draft.workspaceId,
        workflowId: draft.workflowId,
        userId: session.user.id,
        title: nextBrief.title,
        entryPath: nextBrief.entryPath,
        manifest: plannedPlaceholderManifest(nextBrief.entryPath),
        apiBindings: parseApiBindings(draft.apiBindings),
        structuredBrief: nextBrief,
        visualBrief: parseStoredVisualBrief(draft.structuredBrief),
        planStatus: 'planned',
      })

      const [updated] = await db
        .select()
        .from(generativeAppDraft)
        .where(eq(generativeAppDraft.id, draft.id))
        .limit(1)
      if (!updated) {
        return createErrorResponse('Draft not found', 404)
      }

      const manifest = updated.manifest as ArenaGenerativeAppManifest
      return createSuccessResponse({
        id: updated.id,
        title: updated.title,
        entryPath: updated.entryPath,
        revision: updated.revision,
        workflowId: updated.workflowId,
        latestRevisionId: null,
        pages: pageSummariesFromManifest(manifest),
        apiBindings: parseApiBindings(updated.apiBindings),
        manifest,
        revisionDiff: null,
        brief: updated.brief ?? null,
        screenshotMatchNotes: screenshotMatchNotesFromDraft(updated.structuredBrief),
        generateWarnings: parseStoredGenerateWarnings(updated.structuredBrief),
        adoptedChanges: parseStoredAdoptedChanges(updated.structuredBrief),
        screenshotGaps: screenshotGapsFromDraft(updated.structuredBrief),
        ...productContractFields(updated.structuredBrief),
      })
    } catch (error) {
      logger.error('Failed to patch generative app draft', { error: getErrorMessage(error) })
      return createErrorResponse(getErrorMessage(error, 'Failed to update plan'), 500)
    }
  }
)
