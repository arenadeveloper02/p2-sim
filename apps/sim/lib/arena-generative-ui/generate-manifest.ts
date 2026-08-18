import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import { getErrorMessage, toError } from '@sim/utils/errors'
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
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeAppManifest,
  ArenaGenerativeGenerateResult,
  ArenaGenerativePageHint,
} from '@/lib/arena-generative-ui/types'
import {
  GENERATOR_OMITTED_PAGES_ERROR,
  validateArenaGenerativeManifest,
} from '@/lib/arena-generative-ui/validate-manifest'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { getMaxOutputTokensForModel, supportsTemperature } from '@/providers/utils'

const logger = createLogger('ArenaGenerativeUi')

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS = 16_384

/** Shown when the model reply is truncated or is not a JSON object. User Input is prose. */
export const MODEL_JSON_PARSE_ERROR =
  'The generator returned invalid JSON. User Input can be plain language — retry the run.'

const PAGES_RETRY_USER_MESSAGE =
  'Return the same app as one JSON object; manifest.pages must be a non-empty object keyed by path (home, …).'

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
}

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
  const userPayload = [
    params.existingManifest
      ? `Mode: edit an existing app. Apply the requested changes and return a complete replacement manifest.`
      : `Mode: generate a new multi-page app.`,
    params.entryPath ? `Requested entryPath: ${params.entryPath}` : '',
    pageHints.length > 0
      ? `Requested pages (must emit exactly these paths as object keys, not an array):\n${JSON.stringify(pageHints, null, 2)}`
      : [
          'No explicit page list. Infer a small coherent sitemap from the brief. Emit manifest.pages as an object keyed by path (home, person, …), never as an array.',
          bindingKeys.length > 0
            ? `CTA apiKey values must be one of these declared binding keys: ${bindingKeys.join(', ')}. Do not invent keys from User Input.`
            : '',
        ]
          .filter((line) => line.length > 0)
          .join('\n'),
    bindingsSummary.length > 0
      ? `Declared API bindings (CTAs may only use these keys):\n${JSON.stringify(bindingsSummary, null, 2)}`
      : 'No API bindings. Navigation and static content only.',
    params.designNotes?.trim() ? `Design notes:\n${params.designNotes.trim()}` : '',
    params.existingManifest ? `Existing manifest:\n${JSON.stringify(params.existingManifest)}` : '',
    `User request:\n${userInput}`,
  ]
    .filter((section) => section.length > 0)
    .join('\n\n')

  try {
    const apiKey = getRotatingApiKey('anthropic')
    const anthropic = new Anthropic({ apiKey })
    const modelId = DEFAULT_MODEL
    const maxTokens = Math.min(getMaxOutputTokensForModel(modelId), MAX_OUTPUT_TOKENS)
    const messageOptions = {
      model: modelId,
      max_tokens: maxTokens,
      ...(supportsTemperature(modelId) ? { temperature: 0.2 } : {}),
      system: systemPrompt,
    }

    const message = await createAnthropicMessage(anthropic, {
      ...messageOptions,
      messages: [{ role: 'user', content: userPayload }],
    })

    let rawText = extractMessageText(message)
    if (!rawText) {
      return { success: false, error: 'Model returned an empty response' }
    }

    const validationOptions = {
      pageHints: pageHints.length > 0 ? pageHints : undefined,
      apiBindings: params.apiBindings,
      entryPath: params.entryPath,
    }

    let parsed = parseLlmJsonObject(rawText)
    let validation = validateArenaGenerativeManifest(
      extractManifestCandidate(parsed),
      validationOptions
    )

    if (validation.error === GENERATOR_OMITTED_PAGES_ERROR) {
      logger.warn('Arena Generative UI omitted pages; retrying once')
      const retryMessage = await createAnthropicMessage(anthropic, {
        ...messageOptions,
        messages: [
          { role: 'user', content: userPayload },
          { role: 'assistant', content: rawText },
          { role: 'user', content: PAGES_RETRY_USER_MESSAGE },
        ],
      })
      rawText = extractMessageText(retryMessage)
      if (!rawText) {
        return { success: false, error: GENERATOR_OMITTED_PAGES_ERROR }
      }
      parsed = parseLlmJsonObject(rawText)
      validation = validateArenaGenerativeManifest(
        extractManifestCandidate(parsed),
        validationOptions
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
    const message = getErrorMessage(error, 'Failed to generate app')
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
