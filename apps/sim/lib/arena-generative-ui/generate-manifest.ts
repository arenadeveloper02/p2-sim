import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { truncate } from '@sim/utils/string'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import { bindingsSummaryForPrompt } from '@/lib/arena-generative-ui/bindings-prompt'
import { resolveCapabilities } from '@/lib/arena-generative-ui/capabilities'
import {
  type ArenaGenerativeCritique,
  critiqueArenaGenerativeManifest,
  formatCriticRepairError,
  mustFixCriticIssues,
} from '@/lib/arena-generative-ui/critique-manifest'
import {
  type ArenaGenerativeEditScope,
  planArenaGenerativeEditScope,
  unscopedPageIndex,
} from '@/lib/arena-generative-ui/edit-scope'
import { formatGenerateFailureForUser } from '@/lib/arena-generative-ui/format-generate-failure'
import {
  type ArenaGenerativeIntent,
  analyzeArenaGenerativeIntent,
} from '@/lib/arena-generative-ui/intent-analyzer'
import { mergeScopedManifestEdit } from '@/lib/arena-generative-ui/merge-scoped-edit'
import {
  extractManifestCandidate,
  parseLlmJsonObject,
} from '@/lib/arena-generative-ui/parse-inputs'
import {
  buildGeneratorSystemPrompt,
  generatorPromptOptionsFromBrief,
} from '@/lib/arena-generative-ui/prompt-pipeline'
import { isReplanEdit, plannerInputForReplan } from '@/lib/arena-generative-ui/replan-from-edit'
import {
  type ArenaGenerativeStructuredBrief,
  briefHasDummyOrLocalData,
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
import {
  formatVisualBriefForGenerator,
  formatVisualBriefStatus,
  MATCH_SCREENSHOT_USER_INPUT,
  type ArenaGenerativeVisualBrief,
} from '@/lib/arena-generative-ui/visual-brief'
import { hostCriticManifestIssues } from '@/lib/arena-generative-ui/ui-critic'
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
export const MAX_REPAIR_ATTEMPTS = 3

/** Host-critic issues packed into one repair turn. Remaining issues wait for the next scan. */
export const HOST_CRITIC_REPAIR_ISSUE_CAP = 8

/** Shown when the model reply is truncated or is not a JSON object. User Input is prose. */
export const MODEL_JSON_PARSE_ERROR =
  'The generator returned invalid JSON. User Input can be plain language — retry the run.'

const PAGES_RETRY_USER_MESSAGE =
  'Return the same app as one JSON object; manifest.pages must be a non-empty object keyed by path (home, …).'

function hasNumberedRepairIssues(error: string): boolean {
  return /(?:^|\n)\d+\. /.test(error)
}

/**
 * Numbered host-critic list for one repair turn. Extra issues are named so the
 * next scan can pick them up if budget remains.
 */
export function formatHostCriticRepairError(
  issues: string[],
  cap = HOST_CRITIC_REPAIR_ISSUE_CAP
): string {
  const shown = issues.slice(0, cap)
  const lines = shown.map((issue, index) => `${index + 1}. ${issue}`)
  if (issues.length > cap) {
    lines.push(`Showing the first ${cap} of ${issues.length} issues.`)
  }
  return lines.join('\n')
}

/**
 * Follow-up for a reply that parsed but failed validation. Naming the failing
 * page, prop, or action turns the next attempt into a fix rather than a reroll.
 */
function repairUserMessage(error: string, scopedPaths: string[]): string {
  if (error === GENERATOR_OMITTED_PAGES_ERROR) {
    return PAGES_RETRY_USER_MESSAGE
  }
  const numbered = hasNumberedRepairIssues(error)
  const subject = scopedPaths.length > 0 ? 'reply' : 'manifest'
  const intro = numbered
    ? `That ${subject} failed validation:\n${error}`
    : `That ${subject} failed validation: ${error}`
  if (scopedPaths.length > 0) {
    const fix = numbered ? 'Fix every numbered issue.' : 'Fix only what the error names.'
    return [
      intro,
      `Return one complete JSON object again, with manifest.pages containing only these page keys and their full specs: ${scopedPaths.join(', ')}. ${fix}`,
    ].join('\n\n')
  }
  const fix = numbered
    ? 'Fix every numbered issue and keep every other page, element, prop, and copy string identical.'
    : 'Fix only what the error names and keep every other page, element, prop, and copy string identical.'
  return [
    intro,
    `Return the corrected app as one complete JSON object in the same shape. ${fix}`,
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

function formatIntentStatus(intent: ArenaGenerativeIntent | null, intentError?: string): string {
  if (intent) {
    return `Intent: ${intent.task}`
  }
  if (intentError) {
    return `Intent skipped (${intentError}); planner inferred from prose.`
  }
  return ''
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

function formatEditScopeStatus(
  scope: ArenaGenerativeEditScope | null,
  themeOnly: boolean,
  replan = false
): string {
  if (replan) return 'Edit scope: replan (new sitemap).'
  if (themeOnly) return 'Edit scope: theme only (pages unchanged).'
  if (!scope) return 'Edit scope: global rewrite.'
  if (scope.mode === 'pages' && scope.pages.length > 0) {
    return `Edit scope: pages [${scope.pages.join(', ')}].`
  }
  return 'Edit scope: global rewrite.'
}

function formatCriticStatus(critique: ArenaGenerativeCritique, repaired: boolean): string {
  if (repaired) return 'UI critic: repaired'
  if (critique.skipped) return 'UI critic: skipped (unavailable)'
  return 'UI critic: passed'
}

function withStatusPrefix(content: string, ...lines: string[]): string {
  const prefix = lines.filter((line) => line.length > 0).join('\n')
  return prefix ? `${prefix}\n\n${content}` : content
}

interface EvaluateGeneratedCandidateOptions {
  isScopedEdit: boolean
  existingManifest?: ArenaGenerativeAppManifest
  editScope: ArenaGenerativeEditScope | null
  scopedPaths: string[]
  validationOptions: {
    pageHints?: ArenaGenerativePageHint[]
    apiBindings: ArenaGenerativeApiBinding[]
    entryPath?: string
    authoredPagePaths?: string[]
  }
}

/**
 * Catalog validate, then the host UI critic. Either failure is a repair reason.
 */
function evaluateGeneratedCandidate(
  candidate: Record<string, unknown>,
  options: EvaluateGeneratedCandidateOptions
): ManifestValidationResult {
  const merged =
    options.isScopedEdit && options.existingManifest && options.editScope
      ? mergeScopedManifestEdit(options.existingManifest, candidate, {
          pages: options.scopedPaths,
          touchesActions: options.editScope.touchesActions,
          touchesTheme: options.editScope.touchesTheme,
        })
      : null
  if (merged && !merged.ok) {
    return { success: false, error: merged.error }
  }
  const validation = validateArenaGenerativeManifest(
    merged ? merged.candidate : candidate,
    options.validationOptions
  )
  if (!validation.success || !validation.manifest) {
    return validation
  }
  const hostIssues = hostCriticManifestIssues(validation.manifest, {
    authoredPagePaths: options.validationOptions.authoredPagePaths,
  })
  if (hostIssues.length > 0) {
    return { success: false, error: formatHostCriticRepairError(hostIssues) }
  }
  return validation
}

/**
 * Catalog error, or every remaining host-critic issue when the last reply
 * already passed catalog validation.
 */
function remainingIssuesForUser(
  candidate: Record<string, unknown>,
  options: EvaluateGeneratedCandidateOptions,
  fallback: string
): string[] {
  const merged =
    options.isScopedEdit && options.existingManifest && options.editScope
      ? mergeScopedManifestEdit(options.existingManifest, candidate, {
          pages: options.scopedPaths,
          touchesActions: options.editScope.touchesActions,
          touchesTheme: options.editScope.touchesTheme,
        })
      : null
  if (merged && !merged.ok) {
    return [merged.error]
  }
  const validation = validateArenaGenerativeManifest(
    merged ? merged.candidate : candidate,
    options.validationOptions
  )
  if (!validation.success || !validation.manifest) {
    return [validation.error ?? fallback]
  }
  const hostIssues = hostCriticManifestIssues(validation.manifest, {
    authoredPagePaths: options.validationOptions.authoredPagePaths,
  })
  return hostIssues.length > 0 ? hostIssues : [fallback]
}

function generateFailureForUser(
  candidate: Record<string, unknown>,
  options: EvaluateGeneratedCandidateOptions,
  fallback: string
): ArenaGenerativeGenerateResult {
  return {
    success: false,
    error: formatGenerateFailureForUser({
      issues: remainingIssuesForUser(candidate, options, fallback),
      repairAttempts: MAX_REPAIR_ATTEMPTS,
    }),
  }
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
  /** New screenshot interpretation for this run. */
  visualBrief?: ArenaGenerativeVisualBrief
  /** Stored screenshot interpretation. Used on re-plan when no new screenshots were uploaded. */
  existingVisualBrief?: ArenaGenerativeVisualBrief
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

/** Opening instruction when Requested Changes explicitly asks to rebuild the app. */
export const REPLAN_GENERATE_INSTRUCTION = [
  'Mode: generate a new multi-page app. The user asked to re-plan an existing draft.',
  'Invent a new sitemap from the request. Do not preserve the previous pages, copy, or layout.',
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
  const userInput =
    params.userInput.trim() || (params.visualBrief ? MATCH_SCREENSHOT_USER_INPUT : '')
  if (!userInput) {
    return { success: false, error: 'userInput is required' }
  }

  const hasStreamingBinding = params.apiBindings.some((binding) => binding.stream === true)
  const hasExisting = Boolean(params.existingManifest)
  const isReplan = hasExisting && isReplanEdit(userInput)
  const isPreserveEdit = hasExisting && !isReplan
  const visualBrief =
    params.visualBrief ?? (!isPreserveEdit ? params.existingVisualBrief : undefined)
  const pinnedPageHints = params.pages?.filter((page) => page.path.trim().length > 0) ?? []

  if (
    isPreserveEdit &&
    params.existingManifest &&
    !visualBrief &&
    isThemeOnlyEdit(userInput, null)
  ) {
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

  const plannerUserInput = isReplan
    ? plannerInputForReplan({
        editInstructions: userInput,
        existingBrief: params.existingBrief,
      })
    : userInput

  let analyzedIntent: ArenaGenerativeIntent | null = isPreserveEdit
    ? (params.existingStructuredBrief?.intent ?? null)
    : null
  let intentError: string | undefined
  if (!isPreserveEdit) {
    const analyzed = await analyzeArenaGenerativeIntent({
      userInput: plannerUserInput,
      apiBindings: params.apiBindings,
      designNotes: params.designNotes,
      visualBrief,
    })
    analyzedIntent = analyzed.intent
    intentError = analyzed.error
    if (analyzedIntent) {
      logger.info('Analyzed Arena Generative UI intent', {
        task: analyzedIntent.task,
        workflowComplexity: analyzedIntent.workflowComplexity,
        replan: isReplan,
      })
    }
  }

  const planned = isPreserveEdit
    ? { brief: null as ArenaGenerativeStructuredBrief | null }
    : await planArenaGenerativeStructuredBrief({
        userInput: plannerUserInput,
        pages: pinnedPageHints,
        entryPath: params.entryPath,
        apiBindings: params.apiBindings,
        designNotes: params.designNotes,
        intent: analyzedIntent,
        visualBrief,
      })
  const structuredBrief = planned.brief
  const intentBrief = isPreserveEdit ? (params.existingStructuredBrief ?? null) : structuredBrief
  const plannerError = 'error' in planned ? planned.error : undefined
  if (structuredBrief) {
    logger.info('Planned Arena Generative UI structured brief', {
      archetype: structuredBrief.archetype,
      pageCount: structuredBrief.pages.length,
      entryPath: structuredBrief.entryPath,
      replan: isReplan,
    })
  } else if (isPreserveEdit && intentBrief) {
    logger.info('Reusing stored Arena Generative UI structured brief', {
      archetype: intentBrief.archetype,
      pageCount: intentBrief.pages.length,
    })
  }

  /**
   * A pinned sitemap already contracts the run and supplies the page hints a scope
   * would have, so scoping it would only add a round trip. Re-plan is a generate,
   * not a patch, so it skips the scoper too.
   */
  const editScope: ArenaGenerativeEditScope | null =
    isPreserveEdit && params.existingManifest && pinnedPageHints.length === 0
      ? await planArenaGenerativeEditScope({
          editInstructions: userInput,
          manifest: params.existingManifest,
          apiBindings: params.apiBindings,
        })
      : null
  const scopedPaths = isPreserveEdit && editScope?.mode === 'pages' ? editScope.pages : []
  const isScopedEdit = scopedPaths.length > 0
  if (isPreserveEdit && params.existingManifest) {
    logger.info('Scoped Arena Generative UI edit', {
      mode: isScopedEdit ? 'pages' : 'global',
      scopedPaths,
      pageSetStable: editScope?.pageSetStable,
      totalPages: Object.keys(params.existingManifest.pages).length,
    })
  }

  const systemPrompt = buildGeneratorSystemPrompt({
    ...generatorPromptOptionsFromBrief(intentBrief, {
      hasBindings: params.apiBindings.length > 0,
      hasStreamingBinding,
    }),
    capabilities: resolveCapabilities({
      planned: [...(intentBrief?.capabilities ?? []), ...(intentBrief?.processing ?? [])],
      bindings: params.apiBindings,
    }),
    hasBindings: params.apiBindings.length > 0,
    hasStreamingBinding,
    isScopedEdit,
  })

  /**
   * An unscoped edit is otherwise free to drop a page: with no hints, the extra and
   * missing page checks in `validateArenaGenerativeManifest` are both switched off.
   * Only pin them when the scoper said the page set is stable — pinning them for an
   * edit that means to add or remove a page would reject the very change requested.
   */
  const editPageHints =
    isPreserveEdit && !isScopedEdit && editScope?.pageSetStable === true && params.existingManifest
      ? pageHintsFromManifest(params.existingManifest)
      : []
  const pageHints =
    pinnedPageHints.length > 0
      ? pinnedPageHints
      : !isPreserveEdit && structuredBrief
        ? pageHintsFromStructuredBrief(structuredBrief)
        : editPageHints
  const bindingsSummary = bindingsSummaryForPrompt(params.apiBindings)

  const bindingKeys = params.apiBindings.map((binding) => binding.key).filter(Boolean)
  const bindingKeyLine =
    bindingKeys.length > 0
      ? `CTA apiKey values must be one of these declared binding keys: ${bindingKeys.join(', ')}. Do not invent keys from User Input.`
      : ''
  const requestedEntryPath =
    params.entryPath || (isPreserveEdit ? undefined : structuredBrief?.entryPath)
  const sharedSections = [
    bindingsSummary.length > 0
      ? `Declared API bindings (CTAs may only use these keys):\n${JSON.stringify(bindingsSummary, null, 2)}`
      : structuredBrief && briefHasDummyOrLocalData(structuredBrief)
        ? 'No API bindings. Dummy/local actions stay in manifest.actions with no apiKey. Seed static collection rows and use onSuccess.setState / navigate. Do not invent API keys.'
        : 'No API bindings. Navigation and static content only unless the structured brief named dummy/local actions.',
    params.designNotes?.trim() ? `Design notes:\n${params.designNotes.trim()}` : '',
    visualBrief ? formatVisualBriefForGenerator(visualBrief) : '',
    isPreserveEdit && params.existingBrief?.trim()
      ? `Original brief (context only — already implemented, do not re-apply it):\n${params.existingBrief.trim()}`
      : '',
    isPreserveEdit && intentBrief ? formatStructuredBriefForEdit(intentBrief) : '',
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
          isPreserveEdit
            ? EDIT_PRESERVATION_INSTRUCTION
            : isReplan
              ? REPLAN_GENERATE_INSTRUCTION
              : 'Mode: generate a new multi-page app.',
          requestedEntryPath
            ? `Requested entryPath: ${requestedEntryPath}`
            : isPreserveEdit
              ? EDIT_KEEP_ENTRY_PATH_INSTRUCTION
              : '',
          pageHints.length > 0
            ? `Requested pages (must emit exactly these paths as object keys, not an array):\n${JSON.stringify(pageHints, null, 2)}`
            : [
                isPreserveEdit
                  ? EDIT_KEEP_PAGES_INSTRUCTION
                  : 'No explicit page list. Infer a small coherent sitemap from the brief, including destination and collection pages the job needs even if the user only named the starting screen. Emit manifest.pages as an object keyed by path (home, person, …), never as an array.',
                bindingKeyLine,
              ]
                .filter((line) => line.length > 0)
                .join('\n'),
          structuredBrief ? formatStructuredBriefForGenerator(structuredBrief) : '',
          ...sharedSections,
          isPreserveEdit && params.existingManifest
            ? `Existing manifest:\n${JSON.stringify(params.existingManifest)}`
            : '',
          isPreserveEdit
            ? `Requested changes:\n${userInput}`
            : `User request:\n${isReplan ? plannerUserInput : userInput}`,
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
          existingManifest: isPreserveEdit ? params.existingManifest : undefined,
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

    const evaluateOptions: EvaluateGeneratedCandidateOptions = {
      isScopedEdit,
      existingManifest: params.existingManifest,
      editScope,
      scopedPaths,
      validationOptions,
    }

    const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userPayload }]
    let parsed: Record<string, unknown> = {}
    let validation: ManifestValidationResult = { success: false }
    let lastRawText = ''
    let attempt = 0

    for (; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
      const message = await createAnthropicMessage(anthropic, { ...messageOptions, messages })
      const rawText = extractMessageText(message)
      if (!rawText) {
        return {
          success: false,
          error: validation.error ?? 'Model returned an empty response',
        }
      }
      lastRawText = rawText

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
      /**
       * The scoped reply is folded into the existing manifest before validation, so
       * every invariant — catalog shape, reachability, action keys — is still checked
       * against the whole app, and untouched pages come through by reference.
       */
      validation = evaluateGeneratedCandidate(extractManifestCandidate(parsed), evaluateOptions)
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
      return generateFailureForUser(
        extractManifestCandidate(parsed),
        evaluateOptions,
        validation.error ?? 'Generated manifest failed validation'
      )
    }

    let critique: ArenaGenerativeCritique = { pass: true, issues: [] }
    let criticRepaired = false
    try {
      critique = await critiqueArenaGenerativeManifest({
        manifest: validation.manifest,
        apiBindings: params.apiBindings,
        brief: intentBrief,
        authoredPagePaths: isScopedEdit ? scopedPaths : undefined,
      })
    } catch (error) {
      logger.warn('Arena Generative UI critic threw; skipping', { error: toError(error).message })
      critique = { pass: true, issues: [], skipped: true }
    }

    const mustFix = mustFixCriticIssues(critique)
    if (mustFix.length > 0 && attempt < MAX_REPAIR_ATTEMPTS) {
      logger.warn('Arena Generative UI critic requested a repair turn', {
        issues: mustFix.length,
      })
      messages.push(
        { role: 'assistant', content: lastRawText },
        { role: 'user', content: repairUserMessage(formatCriticRepairError(mustFix), scopedPaths) }
      )
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
        logger.warn('Arena Generative UI critic repair held no parseable JSON object', {
          stopReason: message.stop_reason,
          preview: truncate(rawText, 600),
        })
        throw error
      }
      validation = evaluateGeneratedCandidate(extractManifestCandidate(parsed), evaluateOptions)
      if (!validation.success || !validation.manifest) {
        logger.warn('Arena Generative UI critic repair failed validation', {
          error: validation.error,
        })
        return generateFailureForUser(
          extractManifestCandidate(parsed),
          evaluateOptions,
          validation.error ?? 'Generated manifest failed validation'
        )
      }
      criticRepaired = true
    }

    const title =
      typeof parsed.title === 'string' && parsed.title.trim()
        ? parsed.title.trim()
        : validation.manifest.pages[validation.manifest.entryPath]?.title || 'Generated app'
    const content =
      typeof parsed.content === 'string' && parsed.content.trim()
        ? parsed.content.trim()
        : `Generated ${Object.keys(validation.manifest.pages).length} page(s).`
    const criticStatus = formatCriticStatus(critique, criticRepaired)
    const intentStatus = formatIntentStatus(analyzedIntent, intentError)
    const plannerStatus = formatPlannerStatus(structuredBrief, plannerError)
    const visualStatus = formatVisualBriefStatus(visualBrief ?? null)
    const statusLines = isReplan
      ? [
          formatEditScopeStatus(null, false, true),
          visualStatus,
          intentStatus,
          plannerStatus,
          criticStatus,
        ]
      : isPreserveEdit
        ? [formatEditScopeStatus(editScope, false), visualStatus, criticStatus]
        : [visualStatus, intentStatus, plannerStatus, criticStatus]

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
      ...(isReplan
        ? { editScope: { mode: 'replan' as const, pages: [] } }
        : isPreserveEdit
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
