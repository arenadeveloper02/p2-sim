import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import type {
  ParsedArenaGenerativeEditBody,
  ParsedArenaGenerativeGenerateBody,
} from '@/lib/api/contracts/arena-generative-apps'
import { generateArenaGenerativeManifest } from '@/lib/arena-generative-ui/generate-manifest'
import { parseStoredGenerateWarnings } from '@/lib/arena-generative-ui/generate-warnings'
import { interpretArenaGenerativeVisualBrief } from '@/lib/arena-generative-ui/interpret-visual-brief'
import { summarizeManifestDiff } from '@/lib/arena-generative-ui/manifest-diff'
import { parseApiBindings, parsePageHints } from '@/lib/arena-generative-ui/parse-inputs'
import { persistGenerativeAppDraft } from '@/lib/arena-generative-ui/persist-draft'
import { refreshWorkflowBindingOutputSchemas } from '@/lib/arena-generative-ui/refresh-binding-schemas'
import { plannerInputForReplan } from '@/lib/arena-generative-ui/replan-from-edit'
import { parseStoredStructuredBrief } from '@/lib/arena-generative-ui/structured-brief'
import type {
  ArenaGenerativeAppManifest,
  ArenaGenerativeGenerateResult,
} from '@/lib/arena-generative-ui/types'
import {
  MATCH_SCREENSHOT_USER_INPUT,
  parseStoredVisualBrief,
} from '@/lib/arena-generative-ui/visual-brief'
import {
  resolveArenaGenerativeScreenshots,
  screenshotResolveErrorMessage,
} from '@/lib/arena-generative-ui/visual-reference'

const logger = createLogger('ArenaGenerativeUiRun')

export interface ArenaGenerativeToolOutput {
  draftId: string
  revisionId: string
  entryPath: string
  pages: Array<{ path: string; title: string }>
  content: string
  manifest: ArenaGenerativeAppManifest
  structuredBrief?: ArenaGenerativeGenerateResult['structuredBrief']
  plannerError?: string
  generateWarnings?: ArenaGenerativeGenerateResult['generateWarnings']
  editScope?: ArenaGenerativeGenerateResult['editScope']
}

/**
 * Shared generate/edit pipeline used by tool API routes.
 */
export async function runArenaGenerativeUi(options: {
  body: ParsedArenaGenerativeGenerateBody | ParsedArenaGenerativeEditBody
  userId: string
  requireExistingDraft: boolean
}): Promise<
  { success: true; output: ArenaGenerativeToolOutput } | { success: false; error: string }
> {
  const { body, userId, requireExistingDraft } = options
  const editInstructions =
    'editInstructions' in body ? String(body.editInstructions ?? '').trim() : ''
  const workspaceId = body.workspaceId?.trim()
  const workflowId = body.workflowId?.trim()
  if (!workspaceId || !workflowId) {
    return { success: false, error: 'workspaceId and workflowId are required' }
  }

  let pages
  let apiBindings
  try {
    pages = parsePageHints(body.pages)
    apiBindings = parseApiBindings(body.apiBindings)
  } catch (error) {
    return { success: false, error: getErrorMessage(error, 'Invalid pages or apiBindings') }
  }

  let existingManifest: ArenaGenerativeAppManifest | undefined
  let existingBrief: string | undefined
  let existingStructuredBrief: ReturnType<typeof parseStoredStructuredBrief> = null
  let existingVisualBrief: ReturnType<typeof parseStoredVisualBrief> = null
  let existingGenerateWarnings: ReturnType<typeof parseStoredGenerateWarnings> = []
  let existingRevision = 0
  if (requireExistingDraft || body.existingDraftId) {
    if (!body.existingDraftId) {
      return { success: false, error: 'existingDraftId is required' }
    }
    const { db } = await import('@sim/db')
    const { generativeAppDraft } = await import('@sim/db/schema')
    const { and, eq } = await import('drizzle-orm')
    const [draft] = await db
      .select()
      .from(generativeAppDraft)
      .where(
        and(
          eq(generativeAppDraft.id, body.existingDraftId),
          eq(generativeAppDraft.workflowId, workflowId)
        )
      )
      .limit(1)
    if (!draft) {
      return { success: false, error: 'Draft not found' }
    }
    existingManifest = draft.manifest as ArenaGenerativeAppManifest
    existingBrief = draft.brief ?? undefined
    existingStructuredBrief = parseStoredStructuredBrief(draft.structuredBrief)
    existingVisualBrief = parseStoredVisualBrief(draft.structuredBrief)
    existingGenerateWarnings = parseStoredGenerateWarnings(draft.structuredBrief)
    existingRevision = draft.revision
    if (apiBindings.length === 0 && Array.isArray(draft.apiBindings)) {
      apiBindings = parseApiBindings(draft.apiBindings)
    }
  }

  const screenshots = Array.isArray(body.screenshots) ? body.screenshots : []
  let newVisualBrief: ReturnType<typeof parseStoredVisualBrief> = null
  let visualBriefError: string | undefined
  if (screenshots.length > 0) {
    try {
      const images = await resolveArenaGenerativeScreenshots({
        files: screenshots,
        userId,
        requestId: body.executionId ?? workflowId,
      })
      const interpreted = await interpretArenaGenerativeVisualBrief({
        images,
        userInput: String(body.userInput ?? '').trim() || editInstructions,
        designNotes: body.designNotes,
      })
      newVisualBrief = interpreted.brief
      if (!newVisualBrief && !String(body.userInput ?? '').trim() && !editInstructions) {
        return {
          success: false,
          error: interpreted.error ?? 'Could not interpret the screenshot',
        }
      }
      if (!newVisualBrief && interpreted.error) {
        visualBriefError = interpreted.error
        logger.warn('Arena Generative UI visual interpretation failed open', {
          error: interpreted.error,
        })
      }
    } catch (error) {
      return { success: false, error: screenshotResolveErrorMessage(error) }
    }
  }

  const userInput =
    editInstructions ||
    String(body.userInput ?? '').trim() ||
    (newVisualBrief || screenshots.length > 0 ? MATCH_SCREENSHOT_USER_INPUT : '')
  if (!userInput) {
    return {
      success: false,
      error: requireExistingDraft
        ? 'editInstructions is required'
        : 'Describe the app or upload a screenshot',
    }
  }

  apiBindings = await refreshWorkflowBindingOutputSchemas(apiBindings)

  const generateStartedAt = Date.now()
  const generated = await generateArenaGenerativeManifest({
    userInput,
    pages,
    entryPath: body.entryPath,
    apiBindings,
    designNotes: body.designNotes,
    existingManifest,
    existingBrief,
    ...(existingStructuredBrief ? { existingStructuredBrief } : {}),
    ...(newVisualBrief ? { visualBrief: newVisualBrief } : {}),
    ...(existingVisualBrief ? { existingVisualBrief } : {}),
    ...(visualBriefError ? { visualBriefError } : {}),
    ...(existingGenerateWarnings.length > 0 ? { existingGenerateWarnings } : {}),
  })
  logger.info('Generated Arena Generative UI manifest', {
    workspaceId,
    workflowId,
    ms: Date.now() - generateStartedAt,
    pageCount: Object.keys(generated.manifest?.pages ?? {}).length,
    bindingCount: apiBindings.length,
    entryPath: generated.manifest?.entryPath,
  })

  if (!generated.success || !generated.manifest) {
    return { success: false, error: generated.error ?? 'Failed to generate app' }
  }

  try {
    const replanned = generated.editScope?.mode === 'replan'
    const persistStartedAt = Date.now()
    const persisted = await persistGenerativeAppDraft({
      draftId: body.existingDraftId,
      workspaceId,
      workflowId,
      userId,
      title: generated.title ?? 'Generated app',
      entryPath: generated.manifest.entryPath,
      manifest: generated.manifest,
      apiBindings,
      brief: body.existingDraftId
        ? replanned
          ? plannerInputForReplan({
              editInstructions: userInput,
              existingBrief,
            })
          : undefined
        : userInput,
      structuredBrief: body.existingDraftId
        ? replanned
          ? (generated.plannedBrief ?? null)
          : screenshots.length > 0
            ? existingStructuredBrief
            : undefined
        : (generated.plannedBrief ?? null),
      visualBrief: body.existingDraftId
        ? replanned || screenshots.length > 0
          ? (newVisualBrief ?? existingVisualBrief ?? null)
          : undefined
        : (newVisualBrief ?? null),
      ...(generated.generateWarnings !== undefined
        ? { generateWarnings: generated.generateWarnings }
        : {}),
    })
    logger.info('Persisted Arena Generative UI draft', {
      workspaceId,
      workflowId,
      ms: Date.now() - persistStartedAt,
      draftId: persisted.draftId,
      revisionId: persisted.revisionId,
    })

    /**
     * An edit reports what actually moved. Scoped edits cannot touch a page the
     * change request did not name, but an unscoped one still can, so the change
     * list belongs in the block output rather than only in the Deploy panel.
     */
    const revisionDiff = existingManifest
      ? summarizeManifestDiff(
          existingManifest,
          generated.manifest,
          existingRevision,
          persisted.revision
        )
      : null
    const baseContent = generated.content ?? 'Generated app'

    return {
      success: true,
      output: {
        draftId: persisted.draftId,
        revisionId: persisted.revisionId,
        entryPath: generated.manifest.entryPath,
        pages: Object.values(generated.manifest.pages).map((page) => ({
          path: page.path,
          title: page.title,
        })),
        content: revisionDiff ? `${baseContent}\n\n${revisionDiff.summary}` : baseContent,
        manifest: generated.manifest,
        ...(generated.structuredBrief ? { structuredBrief: generated.structuredBrief } : {}),
        ...(generated.plannerError ? { plannerError: generated.plannerError } : {}),
        ...(generated.generateWarnings && generated.generateWarnings.length > 0
          ? { generateWarnings: generated.generateWarnings }
          : {}),
        ...(generated.editScope ? { editScope: generated.editScope } : {}),
      },
    }
  } catch (error) {
    logger.error('Failed to persist generative app draft', { error: getErrorMessage(error) })
    return { success: false, error: getErrorMessage(error, 'Failed to save draft') }
  }
}
