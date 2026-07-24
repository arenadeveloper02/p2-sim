import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import type { Spec } from '@json-render/core'
import { getErrorMessage, toError } from '@sim/utils/errors'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import {
  emailCatalog,
  GENERATIVE_UI_OUTPUT_RULES,
  webpageCatalog,
} from '@/lib/generative-ui/catalogs'
import { renderGenerativeUiSpecToHtml } from '@/lib/generative-ui/render-spec'
import type { GenerativeUiGenerateResult, GenerativeUiMode } from '@/lib/generative-ui/types'
import { getMaxOutputTokensForModel, supportsTemperature } from '@/providers/utils'

const logger = createLogger('GenerativeUi')

const DEFAULT_MODEL = 'claude-haiku-4-5'

export interface GenerateGenerativeUiHtmlParams {
  userInput: string
  mode: GenerativeUiMode
}

function getCatalog(mode: GenerativeUiMode) {
  return mode === 'email' ? emailCatalog : webpageCatalog
}

function extractJsonFromLlmText(text: string): string {
  const trimmed = text.trim()

  if (trimmed.startsWith('{')) {
    return trimmed
  }

  const fencePrefix = /^```(?:json)?\s*\n?/i
  if (fencePrefix.test(trimmed)) {
    const withoutOpen = trimmed.replace(fencePrefix, '')
    const closeIdx = withoutOpen.lastIndexOf('```')
    if (closeIdx >= 0) {
      const inner = withoutOpen.slice(0, closeIdx).trim()
      if (inner.startsWith('{')) {
        return inner
      }
    }
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }
  return trimmed
}

function extractMessageText(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

function parseSpecJson(text: string): unknown {
  const jsonText = extractJsonFromLlmText(text)
  try {
    return JSON.parse(jsonText)
  } catch (error) {
    const preview = text.trim().slice(0, 120).replace(/\s+/g, ' ')
    throw new Error(
      `Model returned invalid JSON (${getErrorMessage(error)}). Preview: ${preview}…`
    )
  }
}

/**
 * Generates catalog-constrained UI JSON from a prompt, then renders HTML.
 */
export async function generateGenerativeUiHtml(
  params: GenerateGenerativeUiHtmlParams
): Promise<GenerativeUiGenerateResult> {
  const mode = params.mode
  const userInput = params.userInput.trim()
  if (!userInput) {
    return { success: false, error: 'userInput is required', mode }
  }

  const catalog = getCatalog(mode)
  const systemPrompt = catalog.prompt({
    customRules: [
      ...GENERATIVE_UI_OUTPUT_RULES,
      mode === 'email'
        ? 'Root element must be type Html containing Head and Body.'
        : 'Root element must be type Page.',
    ],
  })

  try {
    const apiKey = getRotatingApiKey('anthropic')
    const anthropic = new Anthropic({ apiKey })
    const modelId = DEFAULT_MODEL

    const message = await createAnthropicMessage(anthropic, {
      model: modelId,
      max_tokens: Math.min(getMaxOutputTokensForModel(modelId), 8192),
      ...(supportsTemperature(modelId) ? { temperature: 0.2 } : {}),
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Mode: ${mode}\n\nUser request:\n${userInput}`,
        },
      ],
    })

    const rawText = extractMessageText(message)
    if (!rawText) {
      return { success: false, error: 'Model returned an empty response', mode }
    }

    const parsed = parseSpecJson(rawText)
    const validation = catalog.validate(parsed)
    if (!validation.success || !validation.data) {
      const issueSummary =
        validation.error?.issues
          ?.slice(0, 5)
          .map((issue) => issue.message)
          .join('; ') ?? 'invalid spec'
      logger.warn('Generative UI spec validation failed', { mode, issueSummary })
      return {
        success: false,
        error: `Generated UI spec failed validation: ${issueSummary}`,
        mode,
        spec: parsed as Record<string, unknown>,
      }
    }

    const spec = validation.data as Spec
    const html = await renderGenerativeUiSpecToHtml(mode, spec)

    return {
      success: true,
      html,
      spec: spec as unknown as Record<string, unknown>,
      mode,
    }
  } catch (error) {
    logger.error('Generative UI generation failed', { mode, error: toError(error).message })
    return {
      success: false,
      error: getErrorMessage(error, 'Failed to generate HTML'),
      mode,
    }
  }
}
