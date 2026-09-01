import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import { parseLlmJsonObject } from '@/lib/arena-generative-ui/parse-inputs'
import { ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS } from '@/lib/arena-generative-ui/timeout'
import {
  type ArenaGenerativeVisualBrief,
  parseArenaGenerativeVisualBrief,
} from '@/lib/arena-generative-ui/visual-brief'
import type { ArenaGenerativeVisionImage } from '@/lib/arena-generative-ui/visual-reference'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { getMaxOutputTokensForModel, supportsTemperature } from '@/providers/utils'

const logger = createLogger('ArenaGenerativeUiVisual')

const DEFAULT_MODEL = 'claude-haiku-4-5'
const VISUAL_OUTPUT_TOKENS = 2_048
const MAX_VISUAL_ATTEMPTS = 2

const VISUAL_SYSTEM_PROMPT = [
  'You interpret UI screenshots as an Arena Generative UI visual brief. Output one JSON object. No markdown fences, no explanation.',
  'Shape: { "screens": [{ "title?", "inferredPath?", "purpose", "archetype?", "representation?", "regions": [{ "region", "purpose", "archetype?" }], "visibleCopy": string[], "fields": [{ "name", "label", "type?" }], "ctas": string[] }], "layout": { "shell?", "density?", "colorScheme?", "visualTone?", "brandColor?" }, "catalogMapping": [{ "observed", "catalogType" }], "unrepresentable": [{ "observed", "closestCatalogType?", "reason" }] }',
  'screens[] is one entry per distinct screen in the images (home, results, detail). inferredPath is kebab-case. archetype is collection | detail | task | results | dashboard | workflow | content | workspace. representation is list | table | cards. region is navigator | primary | inspector | auxiliary.',
  'visibleCopy is headings, labels, helper text, and empty-state copy you can read. fields[] are form controls. ctas[] are button labels.',
  'layout.shell is minimal | none | tabs | sidebar | workspace. density is compact | comfortable | roomy. colorScheme is light | dark | system. visualTone is professional | friendly | premium | technical | editorial. brandColor is a #RRGGBB accent, only when clearly visible.',
  'catalogMapping maps observed widgets onto Arena catalog types (Page, Section, Stack, Grid, Columns, Workspace, AppHeader, PageHeader, Card, Table, Repeat, Stat, Form fields, Chat, Chart, …).',
  'unrepresentable lists widgets Arena cannot reproduce (custom kanban, glassmorphism, illustrations, unique marketing layouts). closestCatalogType is the nearest catalog type when one exists.',
  'Do not invent product features, pages, or API keys the screenshot does not show. Do not emit a sitemap beyond inferredPath, a manifest, or CSS.',
].join('\n')

const VISUAL_REPAIR_USER_MESSAGE =
  'That was not a valid visual brief. Return one JSON object with screens[], layout, catalogMapping[], and unrepresentable[].'

function extractMessageText(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

export interface InterpretVisualBriefParams {
  images: ArenaGenerativeVisionImage[]
  userInput?: string
  designNotes?: string
}

export type InterpretVisualBriefOutcome = {
  brief: ArenaGenerativeVisualBrief | null
  error?: string
}

function visualUserText(params: InterpretVisualBriefParams): string {
  return [
    'Mode: interpret the attached screenshot(s) as a visual brief. Do not emit a manifest.',
    params.designNotes?.trim() ? `Design notes:\n${params.designNotes.trim()}` : '',
    params.userInput?.trim()
      ? `User request (context; the screenshot is the layout source of truth):\n${params.userInput.trim()}`
      : 'No prose brief. Infer the job from the screenshot(s) alone.',
  ]
    .filter((section) => section.length > 0)
    .join('\n\n')
}

/**
 * One vision pass over uploaded screenshots. Failure is fail-open so generate
 * can still plan from prose when a brief was also provided.
 */
export async function interpretArenaGenerativeVisualBrief(
  params: InterpretVisualBriefParams
): Promise<InterpretVisualBriefOutcome> {
  if (params.images.length === 0) {
    return { brief: null, error: 'screenshots are required' }
  }

  try {
    const apiKey = getRotatingApiKey('anthropic')
    const anthropic = new Anthropic({
      apiKey,
      timeout: ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS,
    })
    const modelId = DEFAULT_MODEL
    const messageOptions = {
      model: modelId,
      max_tokens: Math.min(getMaxOutputTokensForModel(modelId), VISUAL_OUTPUT_TOKENS),
      ...(supportsTemperature(modelId) ? { temperature: 0 } : {}),
      system: VISUAL_SYSTEM_PROMPT,
    }
    const userContent: Anthropic.Messages.ContentBlockParam[] = [
      { type: 'text', text: visualUserText(params) },
      ...params.images,
    ]
    const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userContent }]

    for (let attempt = 0; attempt < MAX_VISUAL_ATTEMPTS; attempt += 1) {
      const message = await createAnthropicMessage(anthropic, { ...messageOptions, messages })
      const rawText = extractMessageText(message)
      if (!rawText) continue
      let brief: ArenaGenerativeVisualBrief | null = null
      try {
        brief = parseArenaGenerativeVisualBrief(parseLlmJsonObject(rawText))
      } catch {
        brief = null
      }
      if (brief) {
        return { brief }
      }
      if (attempt + 1 < MAX_VISUAL_ATTEMPTS) {
        messages.push(
          { role: 'assistant', content: rawText },
          { role: 'user', content: VISUAL_REPAIR_USER_MESSAGE }
        )
      }
    }
    logger.warn('Arena Generative UI visual brief was unusable')
    return { brief: null, error: 'Visual reply was not a valid visual brief' }
  } catch (error) {
    logger.warn('Arena Generative UI visual interpretation failed', {
      error: toError(error).message,
    })
    return { brief: null, error: toError(error).message }
  }
}
