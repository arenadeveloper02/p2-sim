import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { truncate } from '@sim/utils/string'
import { z } from 'zod'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import { bindingsSummaryForPrompt } from '@/lib/arena-generative-ui/bindings-prompt'
import { parseLlmJsonObject } from '@/lib/arena-generative-ui/parse-inputs'
import { ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS } from '@/lib/arena-generative-ui/timeout'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { getMaxOutputTokensForModel, supportsTemperature } from '@/providers/utils'

const logger = createLogger('ArenaGenerativeUiIntent')

const DEFAULT_MODEL = 'claude-haiku-4-5'
const INTENT_OUTPUT_TOKENS = 1_024
const MAX_INTENT_ATTEMPTS = 2
const INTENT_TRUNCATION_SUFFIX = '...'

export const ARENA_GENERATIVE_ENTITY_KINDS = ['collection', 'record', 'metric', 'prose'] as const

export type ArenaGenerativeEntityKind = (typeof ARENA_GENERATIVE_ENTITY_KINDS)[number]

export const ARENA_GENERATIVE_WORKFLOW_COMPLEXITIES = [
  'short',
  'long-running',
  'multi-step',
  'wizard',
] as const

export type ArenaGenerativeWorkflowComplexity =
  (typeof ARENA_GENERATIVE_WORKFLOW_COMPLEXITIES)[number]

function intentProse(maxLength: number) {
  return z
    .string()
    .min(1)
    .transform((value) =>
      truncate(value.trim(), maxLength - INTENT_TRUNCATION_SUFFIX.length, INTENT_TRUNCATION_SUFFIX)
    )
}

const intentEntitySchema = z.object({
  name: intentProse(80),
  kind: z.enum(ARENA_GENERATIVE_ENTITY_KINDS),
})

const intentDataRequirementSchema = z.object({
  apiKey: z.string().min(1).max(64),
  usedFor: intentProse(200),
})

const intentActionSchema = z.object({
  id: z.string().min(1).max(64),
  apiKey: z.string().min(1).max(64),
  purpose: intentProse(400),
})

export const arenaGenerativeIntentSchema = z.object({
  task: intentProse(400),
  audience: intentProse(200),
  entities: z.array(intentEntitySchema).max(12).default([]),
  dataRequirements: z.array(intentDataRequirementSchema).max(16).default([]),
  actions: z.array(intentActionSchema).max(16).default([]),
  workflowComplexity: z.enum(ARENA_GENERATIVE_WORKFLOW_COMPLEXITIES),
})

export type ArenaGenerativeIntent = z.output<typeof arenaGenerativeIntentSchema>

const INTENT_SYSTEM_PROMPT = [
  'You extract product intent from a job description. Output one JSON object. No markdown fences, no explanation.',
  'Shape: { "task", "audience", "entities": [{ "name", "kind" }], "dataRequirements": [{ "apiKey", "usedFor" }], "actions": [{ "id", "apiKey", "purpose" }], "workflowComplexity" }',
  'task is the job in one sentence. audience is a real role (sales ops, analysts) — never "users".',
  'entities[].kind is collection | record | metric | prose. Name domain nouns (orders, company, score, analysis), not UI widgets.',
  'dataRequirements and actions may only use declared binding keys. When no bindings were declared, both arrays are [].',
  'workflowComplexity is short | long-running | multi-step | wizard. A typical search/submit is short; a workflow or generate wait is long-running; a named checklist is multi-step; three or more sequential steps with submit at the end is wizard.',
  'Do not pick an archetype. Do not invent pages, routes, or catalog component types (no SearchField, Table, Card, WorkingCard). Do not emit a sitemap or a manifest.',
].join('\n')

const INTENT_REPAIR_USER_MESSAGE =
  'That was not a valid intent object. Return one JSON object in the intent shape (task, audience, entities[], dataRequirements[], actions[], workflowComplexity). Do not emit an archetype, pages, or a manifest.'

export interface AnalyzeIntentParams {
  userInput: string
  apiBindings: ArenaGenerativeApiBinding[]
  designNotes?: string
}

export type AnalyzeIntentOutcome = {
  intent: ArenaGenerativeIntent | null
  error?: string
}

function extractMessageText(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

/**
 * Drops invented apiKeys so the planner never sees bindings that do not exist.
 */
export function parseArenaGenerativeIntent(
  value: unknown,
  options: { apiBindings: ArenaGenerativeApiBinding[] }
): ArenaGenerativeIntent | null {
  const parsed = arenaGenerativeIntentSchema.safeParse(value)
  if (!parsed.success) return null
  const bindingKeys = new Set(options.apiBindings.map((binding) => binding.key).filter(Boolean))
  if (bindingKeys.size === 0) {
    return { ...parsed.data, dataRequirements: [], actions: [] }
  }
  return {
    ...parsed.data,
    dataRequirements: parsed.data.dataRequirements.filter((item) => bindingKeys.has(item.apiKey)),
    actions: parsed.data.actions.filter((action) => bindingKeys.has(action.apiKey)),
  }
}

function intentUserPayload(params: AnalyzeIntentParams): string {
  const bindingKeys = params.apiBindings.map((binding) => binding.key).filter(Boolean)
  const bindingsSummary = bindingsSummaryForPrompt(params.apiBindings)
  return [
    'Mode: extract product intent. Do not emit an archetype, pages, catalog types, or a manifest.',
    bindingKeys.length > 0
      ? `Declared API bindings (dataRequirements and actions may only use these keys):\n${JSON.stringify(bindingsSummary, null, 2)}`
      : 'No API bindings. dataRequirements and actions must be empty arrays.',
    params.designNotes?.trim() ? `Design notes:\n${params.designNotes.trim()}` : '',
    `User request:\n${params.userInput.trim()}`,
  ]
    .filter((section) => section.length > 0)
    .join('\n\n')
}

/**
 * Cheap first-stage call: task, entities, data, actions, complexity. Does not
 * pick a sitemap. Returns `{ intent: null, error }` on failure so the UI planner
 * can still run from prose.
 */
export async function analyzeArenaGenerativeIntent(
  params: AnalyzeIntentParams
): Promise<AnalyzeIntentOutcome> {
  const userInput = params.userInput.trim()
  if (!userInput) {
    return { intent: null, error: 'userInput is required' }
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
      max_tokens: Math.min(getMaxOutputTokensForModel(modelId), INTENT_OUTPUT_TOKENS),
      ...(supportsTemperature(modelId) ? { temperature: 0 } : {}),
      system: INTENT_SYSTEM_PROMPT,
    }
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: intentUserPayload(params) },
    ]

    for (let attempt = 0; attempt < MAX_INTENT_ATTEMPTS; attempt += 1) {
      const message = await createAnthropicMessage(anthropic, { ...messageOptions, messages })
      const rawText = extractMessageText(message)
      if (!rawText) continue
      let intent: ArenaGenerativeIntent | null = null
      try {
        intent = parseArenaGenerativeIntent(parseLlmJsonObject(rawText), {
          apiBindings: params.apiBindings,
        })
      } catch {
        intent = null
      }
      if (intent) {
        return { intent }
      }
      if (attempt + 1 < MAX_INTENT_ATTEMPTS) {
        messages.push(
          { role: 'assistant', content: rawText },
          { role: 'user', content: INTENT_REPAIR_USER_MESSAGE }
        )
      }
    }
    logger.warn('Arena Generative UI intent was unusable; planning from prose')
    return { intent: null, error: 'Intent reply was not a valid intent object' }
  } catch (error) {
    logger.warn('Arena Generative UI intent analysis failed; planning from prose', {
      error: toError(error).message,
    })
    return { intent: null, error: toError(error).message }
  }
}
