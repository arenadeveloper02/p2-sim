import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import { getErrorMessage, toError } from '@sim/utils/errors'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import {
  ARENA_GENERATIVE_UI_OUTPUT_RULES,
  arenaGenerativeUiCatalog,
} from '@/lib/arena-generative-ui/catalog'
import { parseLlmJsonObject } from '@/lib/arena-generative-ui/parse-inputs'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeAppManifest,
  ArenaGenerativeGenerateResult,
  ArenaGenerativePageHint,
} from '@/lib/arena-generative-ui/types'
import { validateArenaGenerativeManifest } from '@/lib/arena-generative-ui/validate-manifest'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { getMaxOutputTokensForModel, supportsTemperature } from '@/providers/utils'

const logger = createLogger('ArenaGenerativeUi')

const DEFAULT_MODEL = 'claude-haiku-4-5'

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

  const systemPrompt = arenaGenerativeUiCatalog.prompt({
    customRules: [
      ...ARENA_GENERATIVE_UI_OUTPUT_RULES,
      'This UI may be opened as a Sim page or embedded in an Arena iframe. emailId is optional. Do not invent a login form.',
      'Prefer Arena-like surfaces: calm layout, clear hierarchy, one primary CTA per page.',
    ],
  })

  const pageHints = params.pages?.filter((page) => page.path.trim().length > 0) ?? []
  const bindingsSummary = params.apiBindings.map((binding) => ({
    key: binding.key,
    label: binding.label,
    kind: binding.kind,
    inputSchema: binding.inputSchema ?? [],
  }))

  const userPayload = [
    params.existingManifest
      ? `Mode: edit an existing app. Apply the requested changes and return a complete replacement manifest.`
      : `Mode: generate a new multi-page app.`,
    params.entryPath ? `Requested entryPath: ${params.entryPath}` : '',
    pageHints.length > 0
      ? `Requested pages (must emit exactly these paths as object keys, not an array):\n${JSON.stringify(pageHints, null, 2)}`
      : 'No explicit page list. Infer a small coherent sitemap from the brief. Emit manifest.pages as an object keyed by path (home, person, …), never as an array.',
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

    const message = await createAnthropicMessage(anthropic, {
      model: modelId,
      max_tokens: Math.min(getMaxOutputTokensForModel(modelId), 8192),
      ...(supportsTemperature(modelId) ? { temperature: 0.2 } : {}),
      system: systemPrompt,
      messages: [{ role: 'user', content: userPayload }],
    })

    const rawText = extractMessageText(message)
    if (!rawText) {
      return { success: false, error: 'Model returned an empty response' }
    }

    const parsed = parseLlmJsonObject(rawText)
    const manifestCandidate = (parsed.manifest ?? parsed) as Record<string, unknown>
    const validation = validateArenaGenerativeManifest(manifestCandidate, {
      pageHints: pageHints.length > 0 ? pageHints : undefined,
      apiBindings: params.apiBindings,
      entryPath: params.entryPath,
    })

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
    logger.error('Arena Generative UI generation failed', { error: toError(error).message })
    return { success: false, error: getErrorMessage(error, 'Failed to generate app') }
  }
}
