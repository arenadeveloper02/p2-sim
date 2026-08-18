import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import type {
  ParsedArenaGenerativeEditBody,
  ParsedArenaGenerativeGenerateBody,
} from '@/lib/api/contracts/arena-generative-apps'
import { generateArenaGenerativeManifest } from '@/lib/arena-generative-ui/generate-manifest'
import { parseApiBindings, parsePageHints } from '@/lib/arena-generative-ui/parse-inputs'
import { persistGenerativeAppDraft } from '@/lib/arena-generative-ui/persist-draft'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

const logger = createLogger('ArenaGenerativeUiRun')

export interface ArenaGenerativeToolOutput {
  draftId: string
  revisionId: string
  entryPath: string
  pages: Array<{ path: string; title: string }>
  content: string
  manifest: ArenaGenerativeAppManifest
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
    if (apiBindings.length === 0 && Array.isArray(draft.apiBindings)) {
      apiBindings = draft.apiBindings as typeof apiBindings
    }
  }

  const userInput = editInstructions || String(body.userInput ?? '').trim()
  if (!userInput) {
    return {
      success: false,
      error: requireExistingDraft ? 'editInstructions is required' : 'userInput is required',
    }
  }

  const generateStartedAt = Date.now()
  const generated = await generateArenaGenerativeManifest({
    userInput,
    pages,
    entryPath: body.entryPath,
    apiBindings,
    designNotes: body.designNotes,
    existingManifest,
    existingBrief,
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
      brief: body.existingDraftId ? undefined : userInput,
    })
    logger.info('Persisted Arena Generative UI draft', {
      workspaceId,
      workflowId,
      ms: Date.now() - persistStartedAt,
      draftId: persisted.draftId,
      revisionId: persisted.revisionId,
    })

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
        content: generated.content ?? 'Generated app',
        manifest: generated.manifest,
      },
    }
  } catch (error) {
    logger.error('Failed to persist generative app draft', { error: getErrorMessage(error) })
    return { success: false, error: getErrorMessage(error, 'Failed to save draft') }
  }
}
