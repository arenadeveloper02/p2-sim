import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import {
  ARENA_GENERATIVE_UI_ACTION_RESULT_RULE,
  ARENA_GENERATIVE_UI_OUTPUT_RULES,
  ARENA_GENERATIVE_UI_PERSONA,
  ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE,
  arenaGenerativeUiCatalog,
} from '@/lib/arena-generative-ui/catalog'
import { ARENA_GENERATIVE_UI_GOLD_EXAMPLE } from '@/lib/arena-generative-ui/gold-example'
import {
  extractManifestCandidate,
  parseLlmJsonObject,
} from '@/lib/arena-generative-ui/parse-inputs'
import { ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS } from '@/lib/arena-generative-ui/timeout'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeAppManifest,
  ArenaGenerativeGenerateResult,
  ArenaGenerativePageHint,
} from '@/lib/arena-generative-ui/types'
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
const MAX_OUTPUT_TOKENS = 64_000
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
function repairUserMessage(error: string): string {
  if (error === GENERATOR_OMITTED_PAGES_ERROR) {
    return PAGES_RETRY_USER_MESSAGE
  }
  return [
    `That manifest failed validation: ${error}`,
    'Return the corrected app as one complete JSON object in the same shape. Fix only what the error names and keep every other page, element, prop, and copy string identical.',
  ].join('\n\n')
}

/**
 * Pages this run has to emit. Edits re-emit the whole manifest, plus room for a
 * page the change request adds.
 */
function estimatePageCount(
  pageHintCount: number,
  existingManifest?: ArenaGenerativeAppManifest
): number {
  if (pageHintCount > 0) {
    return pageHintCount
  }
  const existing = existingManifest ? Object.keys(existingManifest.pages).length : 0
  return existing > 0 ? existing + 1 : ASSUMED_PAGE_COUNT
}

function outputTokenBudget(modelId: string, pageCount: number): number {
  const requested = BASE_OUTPUT_TOKENS + Math.max(pageCount, 1) * OUTPUT_TOKENS_PER_PAGE
  return Math.min(getMaxOutputTokensForModel(modelId), MAX_OUTPUT_TOKENS, requested)
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
 * Generates or patches a multi-page Arena Generative UI manifest with Claude.
 */
export async function generateArenaGenerativeManifest(
  params: GenerateArenaGenerativeManifestParams
): Promise<ArenaGenerativeGenerateResult> {
  const userInput = params.userInput.trim()
  if (!userInput) {
    return { success: false, error: 'userInput is required' }
  }

  const hasStreamingBinding = params.apiBindings.some((binding) => binding.stream === true)
  const catalogPrompt = arenaGenerativeUiCatalog.prompt({
    customRules: [
      ...ARENA_GENERATIVE_UI_OUTPUT_RULES,
      'This app renders as a full page, embedded in Arena or opened directly. emailId is optional. Do not invent a login form or a logo.',
      ...(params.apiBindings.length > 0 ? [ARENA_GENERATIVE_UI_ACTION_RESULT_RULE] : []),
      ...(hasStreamingBinding ? [ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE] : []),
    ],
  })
  const systemPrompt = [
    ARENA_GENERATIVE_UI_PERSONA,
    catalogPrompt,
    ARENA_GENERATIVE_UI_GOLD_EXAMPLE,
  ].join('\n\n')

  const pageHints = params.pages?.filter((page) => page.path.trim().length > 0) ?? []
  const bindingsSummary = params.apiBindings.map((binding) => ({
    key: binding.key,
    label: binding.label,
    kind: binding.kind,
    inputSchema: binding.inputSchema ?? [],
    outputSchema: binding.outputSchema ?? [],
    stream: binding.stream === true,
  }))

  const bindingKeys = params.apiBindings.map((binding) => binding.key).filter(Boolean)
  const isEdit = Boolean(params.existingManifest)
  const bindingKeyLine =
    bindingKeys.length > 0
      ? `CTA apiKey values must be one of these declared binding keys: ${bindingKeys.join(', ')}. Do not invent keys from User Input.`
      : ''
  const userPayload = [
    isEdit ? EDIT_PRESERVATION_INSTRUCTION : 'Mode: generate a new multi-page app.',
    params.entryPath
      ? `Requested entryPath: ${params.entryPath}`
      : isEdit
        ? EDIT_KEEP_ENTRY_PATH_INSTRUCTION
        : '',
    pageHints.length > 0
      ? `Requested pages (must emit exactly these paths as object keys, not an array):\n${JSON.stringify(pageHints, null, 2)}`
      : [
          isEdit
            ? EDIT_KEEP_PAGES_INSTRUCTION
            : 'No explicit page list. Infer a small coherent sitemap from the brief. Emit manifest.pages as an object keyed by path (home, person, …), never as an array.',
          bindingKeyLine,
        ]
          .filter((line) => line.length > 0)
          .join('\n'),
    bindingsSummary.length > 0
      ? `Declared API bindings (CTAs may only use these keys):\n${JSON.stringify(bindingsSummary, null, 2)}`
      : 'No API bindings. Navigation and static content only.',
    params.designNotes?.trim() ? `Design notes:\n${params.designNotes.trim()}` : '',
    isEdit && params.existingBrief?.trim()
      ? `Original brief (context only — already implemented, do not re-apply it):\n${params.existingBrief.trim()}`
      : '',
    params.existingManifest ? `Existing manifest:\n${JSON.stringify(params.existingManifest)}` : '',
    isEdit ? `Requested changes:\n${userInput}` : `User request:\n${userInput}`,
  ]
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
        estimatePageCount(pageHints.length, params.existingManifest)
      ),
      ...(supportsTemperature(modelId) ? { temperature: 0.2 } : {}),
      system: systemPrompt,
    }

    const validationOptions = {
      pageHints: pageHints.length > 0 ? pageHints : undefined,
      apiBindings: params.apiBindings,
      entryPath: params.entryPath,
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

      parsed = parseLlmJsonObject(rawText)
      validation = validateArenaGenerativeManifest(
        extractManifestCandidate(parsed),
        validationOptions
      )
      if (validation.success || attempt === MAX_REPAIR_ATTEMPTS) {
        break
      }

      logger.warn('Arena Generative UI manifest failed validation; sending a repair turn', {
        attempt: attempt + 1,
        error: validation.error,
      })
      messages.push(
        { role: 'assistant', content: rawText },
        { role: 'user', content: repairUserMessage(validation.error ?? '') }
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

    return {
      success: true,
      title,
      content,
      manifest: validation.manifest,
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
