import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { z } from 'zod'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import { bindingsSummaryForPrompt } from '@/lib/arena-generative-ui/bindings-prompt'
import { parseLlmJsonObject } from '@/lib/arena-generative-ui/parse-inputs'
import type { ArenaGenerativeStructuredBrief } from '@/lib/arena-generative-ui/structured-brief'
import { ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS } from '@/lib/arena-generative-ui/timeout'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeAppManifest,
} from '@/lib/arena-generative-ui/types'
import { compactManifestForCritic } from '@/lib/arena-generative-ui/ui-critic'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { getMaxOutputTokensForModel, supportsTemperature } from '@/providers/utils'

const logger = createLogger('ArenaGenerativeUiCritic')

const DEFAULT_MODEL = 'claude-haiku-4-5'
const CRITIC_OUTPUT_TOKENS = 1_024

const criticIssueSchema = z.object({
  category: z.enum(['ux', 'visual', 'responsive', 'accessibility', 'data']),
  severity: z.enum(['must-fix', 'should-fix']),
  page: z.string().min(1).max(64).optional(),
  message: z.string().min(1).max(400),
  fixHint: z.string().min(1).max(400),
})

const criticReplySchema = z.object({
  pass: z.boolean(),
  issues: z.array(criticIssueSchema).max(16).default([]),
})

export type ArenaGenerativeCriticIssue = z.output<typeof criticIssueSchema>
export type ArenaGenerativeCritique = {
  pass: boolean
  issues: ArenaGenerativeCriticIssue[]
  skipped?: boolean
}

export const ARENA_GENERATIVE_UI_CRITIC_SYSTEM_PROMPT = [
  'You inspect a generated UI spec JSON. Output one JSON object. No markdown fences, no explanation.',
  'Shape: { "pass": boolean, "issues": [{ "category", "severity", "page?", "message", "fixHint" }] }',
  'category is ux | visual | responsive | accessibility | data. severity is must-fix | should-fix.',
  'Inspect the JSON. Do not invent pages or actions. Do not rewrite the spec.',
  'Do not flag host-owned loading skeletons, error banners, Retry, Refresh, aria-busy, or confirm dialogs.',
  'Do not restate dead-button, unknown-apiKey, unbound-required-hostKey, or invalid navigate targets — those already failed validation.',
  'Do not flag missing APIs, invented apiKeys, or dummy/local onLoad setState seed rows when there are no API bindings — that is the dummy contract, not hardcoded data.',
  'Only emit must-fix when a concrete spec change would fix it. Taste nits are should-fix and must not block.',
  'STRUCTURAL is already validated. Ask the remaining questions:',
  'UX — Is the primary task obvious? Is there a loading state (host compiles this — do not flag missing Spinner)? Is there an empty state (emptyText / EmptyState)? Is there an error state (host compiles this)? Can the user recover from errors? Is navigation coherent?',
  'VISUAL — Is hierarchy clear? Is there excessive nesting? Are there too many cards? Are actions visually prioritized?',
  'RESPONSIVE — Does the layout collapse appropriately? Are tables handled appropriately on mobile?',
  'ACCESSIBILITY — Are controls labelled? Is keyboard navigation possible? Are state changes communicated (host aria-busy — do not flag)?',
  'DATA — Does the UI reflect the actual schema? Are optional fields handled? Are empty/null values handled? With no API bindings there is no remote schema — dummy/local setState is the contract.',
].join('\n')

export interface CritiqueManifestParams {
  manifest: ArenaGenerativeAppManifest
  apiBindings: ArenaGenerativeApiBinding[]
  brief?: ArenaGenerativeStructuredBrief | null
  authoredPagePaths?: string[]
}

function extractMessageText(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

/**
 * Parses a critic reply. Invalid JSON or schema is null so the caller can fail open.
 */
export function parseArenaGenerativeCritique(value: unknown): ArenaGenerativeCritique | null {
  const parsed = criticReplySchema.safeParse(value)
  if (!parsed.success) return null
  return { pass: parsed.data.pass, issues: parsed.data.issues }
}

export function mustFixCriticIssues(
  critique: ArenaGenerativeCritique
): ArenaGenerativeCriticIssue[] {
  return critique.issues.filter((issue) => issue.severity === 'must-fix')
}

export function formatCriticRepairError(issues: ArenaGenerativeCriticIssue[]): string {
  return issues
    .map((issue, index) => {
      const page = issue.page ? `page "${issue.page}"` : 'app'
      return `${index + 1}. UI critic must-fix (${issue.category}) on ${page}: ${issue.message} ${issue.fixHint}`
    })
    .join('\n')
}

function criticUserPayload(params: CritiqueManifestParams): string {
  const compact = compactManifestForCritic(params.manifest, params.authoredPagePaths)
  const bindings = bindingsSummaryForPrompt(params.apiBindings)
  const brief = params.brief
    ? {
        purpose: params.brief.purpose,
        audience: params.brief.audience,
        archetype: params.brief.archetype,
      }
    : undefined
  return [
    'Mode: critique a validated generative UI spec. Do not emit a manifest.',
    brief ? `Product brief:\n${JSON.stringify(brief)}` : '',
    bindings.length > 0
      ? `Declared API bindings:\n${JSON.stringify(bindings, null, 2)}`
      : 'No API bindings. Dummy/local is the data contract: onLoad setState seeds collections; CTAs omit apiKey. Do not flag missing APIs, invent keys, or treat those seed rows as hardcoded data.',
    `Spec under review:\n${JSON.stringify(compact)}`,
  ]
    .filter((section) => section.length > 0)
    .join('\n\n')
}

const SKIPPED_CRITIQUE: ArenaGenerativeCritique = { pass: true, issues: [], skipped: true }

/**
 * Cheap one-shot Haiku review of a validated manifest. Parse or API failure
 * returns pass so generate is not blocked by the critic.
 */
export async function critiqueArenaGenerativeManifest(
  params: CritiqueManifestParams
): Promise<ArenaGenerativeCritique> {
  try {
    const apiKey = getRotatingApiKey('anthropic')
    const anthropic = new Anthropic({
      apiKey,
      timeout: ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS,
    })
    const modelId = DEFAULT_MODEL
    const message = await createAnthropicMessage(anthropic, {
      model: modelId,
      max_tokens: Math.min(getMaxOutputTokensForModel(modelId), CRITIC_OUTPUT_TOKENS),
      ...(supportsTemperature(modelId) ? { temperature: 0 } : {}),
      system: ARENA_GENERATIVE_UI_CRITIC_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: criticUserPayload(params) }],
    })
    const rawText = extractMessageText(message)
    if (!rawText) {
      logger.warn('Arena Generative UI critic returned an empty reply; skipping')
      return SKIPPED_CRITIQUE
    }
    const critique = parseArenaGenerativeCritique(parseLlmJsonObject(rawText))
    if (!critique) {
      logger.warn('Arena Generative UI critic reply was not a valid critique object; skipping')
      return SKIPPED_CRITIQUE
    }
    return critique
  } catch (error) {
    logger.warn('Arena Generative UI critic failed open', { error: toError(error).message })
    return SKIPPED_CRITIQUE
  }
}
