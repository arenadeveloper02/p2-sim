import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { truncate } from '@sim/utils/string'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import { bindingsSummaryForPrompt } from '@/lib/arena-generative-ui/bindings-prompt'
import {
  ARENA_GENERATIVE_UI_ACTION_INPUT_RULE,
  ARENA_GENERATIVE_UI_ACTION_RESULT_RULE,
  ARENA_GENERATIVE_UI_DESIGN_GUIDELINES,
  ARENA_GENERATIVE_UI_ON_LOAD_RULE,
  ARENA_GENERATIVE_UI_OUTPUT_RULES,
  ARENA_GENERATIVE_UI_PAGINATION_RULE,
  ARENA_GENERATIVE_UI_PERSONA,
  ARENA_GENERATIVE_UI_SCOPED_EDIT_RULES,
  ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE,
  ARENA_GENERATIVE_UI_THEME_RULE,
  buildArenaGenerativeUiPrompt,
} from '@/lib/arena-generative-ui/catalog'
import {
  type ArenaGenerativeEditScope,
  planArenaGenerativeEditScope,
  unscopedPageIndex,
} from '@/lib/arena-generative-ui/edit-scope'
import { goldExamplePromptForArchetype } from '@/lib/arena-generative-ui/gold-example'
import { mergeScopedManifestEdit } from '@/lib/arena-generative-ui/merge-scoped-edit'
import {
  extractManifestCandidate,
  parseLlmJsonObject,
} from '@/lib/arena-generative-ui/parse-inputs'
import {
  type ArenaGenerativeStructuredBrief,
  archetypeRecipe,
  formatStructuredBriefForEdit,
  formatStructuredBriefForGenerator,
  pageHintsFromStructuredBrief,
  planArenaGenerativeStructuredBrief,
} from '@/lib/arena-generative-ui/structured-brief'
import { applyThemeOnlyEdit, isThemeOnlyEdit } from '@/lib/arena-generative-ui/theme-from-edit'
import { ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS } from '@/lib/arena-generative-ui/timeout'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeAppManifest,
  ArenaGenerativeGenerateResult,
  ArenaGenerativePageHint,
} from '@/lib/arena-generative-ui/types'
import { ARENA_GENERATIVE_UI_HOST_UX_PROMPT } from '@/lib/arena-generative-ui/ux-policy'
import {
  GENERATOR_OMITTED_PAGES_ERROR,
  type ManifestValidationResult,
  validateArenaGenerativeManifest,
} from '@/lib/arena-generative-ui/validate-manifest'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { formatProviderNetworkError } from '@/lib/core/utils/opaque-fetch-error'
import { getMaxOutputTokensForModel, supportsTemperature } from '@/providers/utils'

const logger = createLogger('ArenaGenerativeUi')

const DEFAULT_MODEL = 'claude-sonnet-4-6'

/** Envelope, entryPath, actions, and the model's own preamble budget. */
const BASE_OUTPUT_TOKENS = 8_192
/**
 * A page spec is a flat element map that repeats every optional prop as an
 * explicit null, so it costs far more than the rendered page suggests. A flat
 * cap silently truncates larger apps into a JSON parse error, so the budget
 * tracks how many pages this run has to emit.
 */
const OUTPUT_TOKENS_PER_PAGE = 8_000
/** Matches Sonnet 4.6 catalog max so large sitemaps are not truncated by a leftover 64k cap. */
const MAX_OUTPUT_TOKENS = 128_000
/** Pages a brief with no pinned sitemap is assumed to produce. */
const ASSUMED_PAGE_COUNT = 4

/** Repair turns allowed after the first reply fails validation. */
const MAX_REPAIR_ATTEMPTS = 2

/** Shown when the model reply is truncated or is not a JSON object. User Input is prose. */
export const MODEL_JSON_PARSE_ERROR =
  'The generator returned invalid JSON. User Input can be plain language — retry the run.'

const PAGES_RETRY_USER_MESSAGE =
  'Return the same app as one JSON object; manifest.pages must be a non-empty object keyed by path (home, …).'

/**
 * Follow-up for a reply that parsed but failed validation. Naming the failing
 * page, prop, or action turns the next attempt into a fix rather than a reroll.
 */
function repairUserMessage(error: string, scopedPaths: string[]): string {
  if (error === GENERATOR_OMITTED_PAGES_ERROR) {
    return PAGES_RETRY_USER_MESSAGE
  }
  if (scopedPaths.length > 0) {
    return [
      `That reply failed validation: ${error}`,
      `Return one complete JSON object again, with manifest.pages containing only these page keys and their full specs: ${scopedPaths.join(', ')}. Fix only what the error names.`,
    ].join('\n\n')
  }
  return [
    `That manifest failed validation: ${error}`,
    'Return the corrected app as one complete JSON object in the same shape. Fix only what the error names and keep every other page, element, prop, and copy string identical.',
  ].join('\n\n')
}

/**
 * Pages this run has to emit. A scoped edit emits only the pages in scope, which
 * is where its output-token saving comes from. An unscoped edit re-emits the whole
 * manifest, plus room for a page the change request adds.
 */
function estimatePageCount(options: {
  pageHintCount: number
  scopedPageCount?: number
  existingManifest?: ArenaGenerativeAppManifest
}): number {
  if (options.scopedPageCount && options.scopedPageCount > 0) {
    return options.scopedPageCount
  }
  if (options.pageHintCount > 0) {
    return options.pageHintCount
  }
  const existing = options.existingManifest ? Object.keys(options.existingManifest.pages).length : 0
  return existing > 0 ? existing + 1 : ASSUMED_PAGE_COUNT
}

function outputTokenBudget(modelId: string, pageCount: number): number {
  const requested = BASE_OUTPUT_TOKENS + Math.max(pageCount, 1) * OUTPUT_TOKENS_PER_PAGE
  return Math.min(getMaxOutputTokensForModel(modelId), MAX_OUTPUT_TOKENS, requested)
}

function formatPlannerStatus(
  brief: ArenaGenerativeStructuredBrief | null,
  plannerError?: string
): string {
  if (brief) {
    const paths = brief.pages.map((page) => page.path).join(', ')
    return `Planner: ${brief.archetype} · ${paths}.`
  }
  if (plannerError) {
    return `Planner failed (${plannerError}); generated from the prose brief.`
  }
  return ''
}

function formatEditScopeStatus(scope: ArenaGenerativeEditScope | null, themeOnly: boolean): string {
  if (themeOnly) return 'Edit scope: theme only (pages unchanged).'
  if (!scope) return 'Edit scope: global rewrite.'
  if (scope.mode === 'pages' && scope.pages.length > 0) {
    return `Edit scope: pages [${scope.pages.join(', ')}].`
  }
  return 'Edit scope: global rewrite.'
}

function withStatusPrefix(content: string, ...lines: string[]): string {
  const prefix = lines.filter((line) => line.length > 0).join('\n')
  return prefix ? `${prefix}\n\n${content}` : content
}

function structuredBriefSummary(brief: ArenaGenerativeStructuredBrief) {
  return {
    title: brief.title,
    archetype: brief.archetype,
    entryPath: brief.entryPath,
    pages: brief.pages.map((page) => ({ path: page.path, title: page.title })),
  }
}

function extractMessageText(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

export interface GenerateArenaGenerativeManifestParams {
  userInput: string
  pages?: ArenaGenerativePageHint[]
  entryPath?: string
  apiBindings: ArenaGenerativeApiBinding[]
  designNotes?: string
  existingManifest?: ArenaGenerativeAppManifest
  /** Brief the existing draft was generated from. Context only — it is already implemented. */
  existingBrief?: string
  /** Generate-time structured brief. Context only — do not re-plan or pin the sitemap from it. */
  existingStructuredBrief?: ArenaGenerativeStructuredBrief
}

/**
 * Edit is a delta, not a regeneration: everything the change request does not name must survive
 * byte-identical, or an unrelated instruction silently re-themes the whole app.
 */
export const EDIT_PRESERVATION_INSTRUCTION = [
  'Mode: edit an existing app. Apply ONLY the requested changes and return the complete manifest.',
  'Every page, element, prop, action, copy string, and page path that the change request does not name must stay byte-identical to the existing manifest.',
  'Do not re-theme, re-layout, reword, reorder, rename, add, or remove anything that was not asked for.',
].join(' ')

const EDIT_KEEP_PAGES_INSTRUCTION =
  'No page list was supplied. Keep exactly the pages in the existing manifest — same paths, same keys, same titles — unless the change request asks to add or remove one.'

const EDIT_KEEP_ENTRY_PATH_INSTRUCTION =
  'No entryPath was supplied. Keep the existing manifest entryPath.'

/**
 * Opening instruction for a page-scoped edit. Unlike {@link EDIT_PRESERVATION_INSTRUCTION}
 * this makes no promise about untouched pages, because the host does not ask the model
 * to preserve them — it never sends them and merges the reply over the originals.
 */
export const SCOPED_EDIT_INSTRUCTION = [
  'Mode: edit specific pages of an existing app. Return ONLY the pages listed below, each with its complete spec.',
  'Every other page is kept byte-identical by the host and must not appear in your reply.',
  'Inside the pages you do return, everything the change request does not name must stay byte-identical.',
].join(' ')

/**
 * Scoped-edit user payload: full specs for the pages in scope, and a summary of the
 * rest so cross-page links survive without the model being shown their specs.
 */
function scopedEditSections(manifest: ArenaGenerativeAppManifest, scopedPaths: string[]): string[] {
  const scopedPages: Record<string, ArenaGenerativeAppManifest['pages'][string]> = {}
  for (const path of scopedPaths) {
    const page = manifest.pages[path]
    if (page) {
      scopedPages[path] = page
    }
  }
  const untouched = unscopedPageIndex(manifest, scopedPaths)
  return [
    `Pages to change (return exactly these keys in manifest.pages):\n${JSON.stringify(scopedPaths)}`,
    `Their current definitions:\n${JSON.stringify(scopedPages, null, 2)}`,
    untouched.length > 0
      ? `Other pages in this app. DO NOT return these — the host keeps them unchanged. Listed so you keep links to them working:\n${JSON.stringify(untouched, null, 2)}`
      : '',
    `Existing actions (return only the entries this change alters):\n${JSON.stringify(manifest.actions)}`,
    manifest.theme ? `Existing theme:\n${JSON.stringify(manifest.theme)}` : '',
  ].filter((section) => section.length > 0)
}

/** Page hints taken from a manifest, so an unscoped edit is held to its current page set. */
function pageHintsFromManifest(manifest: ArenaGenerativeAppManifest): ArenaGenerativePageHint[] {
  return Object.values(manifest.pages).map((page) => ({ path: page.path, title: page.title }))
}

export type GenerateArenaGenerativeManifestResult = ArenaGenerativeGenerateResult & {
  /** Full planner object for draft persistence. Not the block-output summary. */
  plannedBrief?: ArenaGenerativeStructuredBrief
}

/**
 * Generates or patches a multi-page Arena Generative UI manifest with Claude.
 */
export async function generateArenaGenerativeManifest(
  params: GenerateArenaGenerativeManifestParams
): Promise<GenerateArenaGenerativeManifestResult> {
  const userInput = params.userInput.trim()
  if (!userInput) {
    return { success: false, error: 'userInput is required' }
  }

  const hasStreamingBinding = params.apiBindings.some((binding) => binding.stream === true)
  const isEdit = Boolean(params.existingManifest)
  const pinnedPageHints = params.pages?.filter((page) => page.path.trim().length > 0) ?? []

  if (isEdit && params.existingManifest && isThemeOnlyEdit(userInput, null)) {
    const manifest = applyThemeOnlyEdit(params.existingManifest, userInput, params.designNotes)
    return {
      success: true,
      title:
        params.existingManifest.pages[params.existingManifest.entryPath]?.title || 'Generated app',
      content: withStatusPrefix(
        'Updated theme without rewriting pages.',
        formatEditScopeStatus(null, true)
      ),
      manifest,
      editScope: { mode: 'theme', pages: [] },
    }
  }

  const planned = isEdit
    ? { brief: null as ArenaGenerativeStructuredBrief | null }
    : await planArenaGenerativeStructuredBrief({
        userInput,
        pages: pinnedPageHints,
        entryPath: params.entryPath,
        apiBindings: params.apiBindings,
        designNotes: params.designNotes,
      })
  const structuredBrief = planned.brief
  const intentBrief = isEdit ? (params.existingStructuredBrief ?? null) : structuredBrief
  const plannerError = 'error' in planned ? planned.error : undefined
  if (structuredBrief) {
    logger.info('Planned Arena Generative UI structured brief', {
      archetype: structuredBrief.archetype,
      pageCount: structuredBrief.pages.length,
      entryPath: structuredBrief.entryPath,
    })
  } else if (isEdit && intentBrief) {
    logger.info('Reusing stored Arena Generative UI structured brief', {
      archetype: intentBrief.archetype,
      pageCount: intentBrief.pages.length,
    })
  }

  /**
   * A pinned sitemap already contracts the run and supplies the page hints a scope
   * would have, so scoping it would only add a round trip.
   */
  const editScope: ArenaGenerativeEditScope | null =
    params.existingManifest && pinnedPageHints.length === 0
      ? await planArenaGenerativeEditScope({
          editInstructions: userInput,
          manifest: params.existingManifest,
          apiBindings: params.apiBindings,
        })
      : null
  const scopedPaths = params.existingManifest && editScope?.mode === 'pages' ? editScope.pages : []
  const isScopedEdit = scopedPaths.length > 0
  if (params.existingManifest) {
    logger.info('Scoped Arena Generative UI edit', {
      mode: isScopedEdit ? 'pages' : 'global',
      scopedPaths,
      pageSetStable: editScope?.pageSetStable,
      totalPages: Object.keys(params.existingManifest.pages).length,
    })
  }

  const catalogPrompt = buildArenaGenerativeUiPrompt({
    customRules: [
      ...ARENA_GENERATIVE_UI_OUTPUT_RULES,
      ARENA_GENERATIVE_UI_THEME_RULE,
      ARENA_GENERATIVE_UI_HOST_UX_PROMPT,
      'This app renders as a full page up to 1280px and also embeds in a narrow Arena iframe (Grid and Columns collapse). emailId is optional. Do not invent a login form or an app wordmark.',
      ...(params.apiBindings.length > 0
        ? [
            ARENA_GENERATIVE_UI_ACTION_INPUT_RULE,
            ARENA_GENERATIVE_UI_ACTION_RESULT_RULE,
            ARENA_GENERATIVE_UI_ON_LOAD_RULE,
            ARENA_GENERATIVE_UI_PAGINATION_RULE,
          ]
        : []),
      ...(hasStreamingBinding ? [ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE] : []),
      ...(isScopedEdit ? ARENA_GENERATIVE_UI_SCOPED_EDIT_RULES : []),
    ],
  })
  const systemPrompt = [
    ARENA_GENERATIVE_UI_PERSONA,
    ARENA_GENERATIVE_UI_DESIGN_GUIDELINES,
    catalogPrompt,
    goldExamplePromptForArchetype(intentBrief?.archetype),
    intentBrief ? archetypeRecipe(intentBrief.archetype) : '',
  ]
    .filter((section) => section.length > 0)
    .join('\n\n')

  /**
   * An unscoped edit is otherwise free to drop a page: with no hints, the extra and
   * missing page checks in `validateArenaGenerativeManifest` are both switched off.
   * Only pin them when the scoper said the page set is stable — pinning them for an
   * edit that means to add or remove a page would reject the very change requested.
   */
  const editPageHints =
    isEdit && !isScopedEdit && editScope?.pageSetStable === true && params.existingManifest
      ? pageHintsFromManifest(params.existingManifest)
      : []
  const pageHints =
    pinnedPageHints.length > 0
      ? pinnedPageHints
      : !isEdit && structuredBrief
        ? pageHintsFromStructuredBrief(structuredBrief)
        : editPageHints
  const bindingsSummary = bindingsSummaryForPrompt(params.apiBindings)

  const bindingKeys = params.apiBindings.map((binding) => binding.key).filter(Boolean)
  const bindingKeyLine =
    bindingKeys.length > 0
      ? `CTA apiKey values must be one of these declared binding keys: ${bindingKeys.join(', ')}. Do not invent keys from User Input.`
      : ''
  const requestedEntryPath = params.entryPath || (isEdit ? undefined : structuredBrief?.entryPath)
  const sharedSections = [
    bindingsSummary.length > 0
      ? `Declared API bindings (CTAs may only use these keys):\n${JSON.stringify(bindingsSummary, null, 2)}`
      : 'No API bindings. Navigation and static content only.',
    params.designNotes?.trim() ? `Design notes:\n${params.designNotes.trim()}` : '',
    isEdit && params.existingBrief?.trim()
      ? `Original brief (context only — already implemented, do not re-apply it):\n${params.existingBrief.trim()}`
      : '',
    isEdit && intentBrief ? formatStructuredBriefForEdit(intentBrief) : '',
  ]
  const userPayload = (
    isScopedEdit && params.existingManifest
      ? [
          SCOPED_EDIT_INSTRUCTION,
          ...scopedEditSections(params.existingManifest, scopedPaths),
          ...sharedSections,
          `Requested changes:\n${userInput}`,
        ]
      : [
          isEdit ? EDIT_PRESERVATION_INSTRUCTION : 'Mode: generate a new multi-page app.',
          requestedEntryPath
            ? `Requested entryPath: ${requestedEntryPath}`
            : isEdit
              ? EDIT_KEEP_ENTRY_PATH_INSTRUCTION
              : '',
          pageHints.length > 0
            ? `Requested pages (must emit exactly these paths as object keys, not an array):\n${JSON.stringify(pageHints, null, 2)}`
            : [
                isEdit
                  ? EDIT_KEEP_PAGES_INSTRUCTION
                  : 'No explicit page list. Infer a small coherent sitemap from the brief, including destination and collection pages the job needs even if the user only named the starting screen. Emit manifest.pages as an object keyed by path (home, person, …), never as an array.',
                bindingKeyLine,
              ]
                .filter((line) => line.length > 0)
                .join('\n'),
          structuredBrief ? formatStructuredBriefForGenerator(structuredBrief) : '',
          ...sharedSections,
          params.existingManifest
            ? `Existing manifest:\n${JSON.stringify(params.existingManifest)}`
            : '',
          isEdit ? `Requested changes:\n${userInput}` : `User request:\n${userInput}`,
        ]
  )
    .filter((section) => section.length > 0)
    .join('\n\n')

  try {
    const apiKey = getRotatingApiKey('anthropic')
    const anthropic = new Anthropic({
      apiKey,
      timeout: ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS,
    })
    const modelId = DEFAULT_MODEL
    const messageOptions = {
      model: modelId,
      max_tokens: outputTokenBudget(
        modelId,
        estimatePageCount({
          pageHintCount: pageHints.length,
          scopedPageCount: isScopedEdit ? scopedPaths.length : undefined,
          existingManifest: params.existingManifest,
        })
      ),
      ...(supportsTemperature(modelId) ? { temperature: 0.2 } : {}),
      system: systemPrompt,
    }

    const validationOptions = {
      pageHints: pageHints.length > 0 ? pageHints : undefined,
      apiBindings: params.apiBindings,
      entryPath: requestedEntryPath,
      /**
       * A scoped edit only authored the pages in scope, so a pre-existing defect on
       * an untouched page must not block it. Generate and whole-manifest edits author
       * everything, so they leave this undefined and every page is checked.
       */
      ...(isScopedEdit ? { authoredPagePaths: scopedPaths } : {}),
    }

    const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userPayload }]
    let parsed: Record<string, unknown> = {}
    let validation: ManifestValidationResult = { success: false }

    for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
      const message = await createAnthropicMessage(anthropic, { ...messageOptions, messages })
      const rawText = extractMessageText(message)
      if (!rawText) {
        return {
          success: false,
          error: validation.error ?? 'Model returned an empty response',
        }
      }

      try {
        parsed = parseLlmJsonObject(rawText)
      } catch (error) {
        logger.warn('Arena Generative UI reply held no parseable JSON object', {
          attempt: attempt + 1,
          stopReason: message.stop_reason,
          maxOutputTokens: messageOptions.max_tokens,
          outputTokens: message.usage?.output_tokens,
          replyChars: rawText.length,
          preview: truncate(rawText, 600),
        })
        throw error
      }
      const candidate = extractManifestCandidate(parsed)
      /**
       * The scoped reply is folded into the existing manifest before validation, so
       * every invariant — catalog shape, reachability, action keys — is still checked
       * against the whole app, and untouched pages come through by reference.
       */
      const merged =
        isScopedEdit && params.existingManifest && editScope
          ? mergeScopedManifestEdit(params.existingManifest, candidate, {
              pages: scopedPaths,
              touchesActions: editScope.touchesActions,
              touchesTheme: editScope.touchesTheme,
            })
          : null
      if (merged && !merged.ok) {
        validation = { success: false, error: merged.error }
      } else {
        validation = validateArenaGenerativeManifest(
          merged ? merged.candidate : candidate,
          validationOptions
        )
      }
      if (validation.success || attempt === MAX_REPAIR_ATTEMPTS) {
        break
      }

      logger.warn('Arena Generative UI manifest failed validation; sending a repair turn', {
        attempt: attempt + 1,
        error: validation.error,
      })
      messages.push(
        { role: 'assistant', content: rawText },
        { role: 'user', content: repairUserMessage(validation.error ?? '', scopedPaths) }
      )
    }

    if (!validation.success || !validation.manifest) {
      logger.warn('Arena Generative UI manifest validation failed', { error: validation.error })
      return { success: false, error: validation.error ?? 'Generated manifest failed validation' }
    }

    const title =
      typeof parsed.title === 'string' && parsed.title.trim()
        ? parsed.title.trim()
        : validation.manifest.pages[validation.manifest.entryPath]?.title || 'Generated app'
    const content =
      typeof parsed.content === 'string' && parsed.content.trim()
        ? parsed.content.trim()
        : `Generated ${Object.keys(validation.manifest.pages).length} page(s).`
    const statusLines = isEdit
      ? [formatEditScopeStatus(editScope, false)]
      : [formatPlannerStatus(structuredBrief, plannerError)]

    return {
      success: true,
      title,
      content: withStatusPrefix(content, ...statusLines),
      manifest: validation.manifest,
      ...(structuredBrief
        ? {
            structuredBrief: structuredBriefSummary(structuredBrief),
            plannedBrief: structuredBrief,
          }
        : {}),
      ...(plannerError ? { plannerError } : {}),
      ...(isEdit
        ? {
            editScope: {
              mode: isScopedEdit ? 'pages' : 'global',
              pages: scopedPaths,
            } as const,
          }
        : {}),
    }
  } catch (error) {
    const message = formatProviderNetworkError(error, 'Failed to generate app')
    logger.error('Arena Generative UI generation failed', { error: toError(error).message })
    if (isModelJsonParseError(message)) {
      return { success: false, error: MODEL_JSON_PARSE_ERROR }
    }
    return { success: false, error: message }
  }
}

function isModelJsonParseError(message: string): boolean {
  return (
    /valid JSON/i.test(message) ||
    /non-object JSON payload/i.test(message) ||
    /Unexpected token/i.test(message) ||
    /Unexpected end of JSON/i.test(message)
  )
}
