import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { truncate } from '@sim/utils/string'
import { z } from 'zod'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import { parseLlmJsonObject } from '@/lib/arena-generative-ui/parse-inputs'
import { ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS } from '@/lib/arena-generative-ui/timeout'
import {
  ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN,
  type ArenaGenerativeApiBinding,
  type ArenaGenerativePageHint,
} from '@/lib/arena-generative-ui/types'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { getMaxOutputTokensForModel, supportsTemperature } from '@/providers/utils'

const logger = createLogger('ArenaGenerativeUiBrief')

const DEFAULT_MODEL = 'claude-sonnet-4-6'
/** Planner output is a compact IA object, not page specs. */
const BRIEF_OUTPUT_TOKENS = 4_096
const MAX_BRIEF_ATTEMPTS = 2

export const ARENA_GENERATIVE_ARCHETYPES = [
  'dashboard',
  'form-result',
  'list-detail',
  'wizard',
] as const

export type ArenaGenerativeArchetype = (typeof ARENA_GENERATIVE_ARCHETYPES)[number]

const pagePathSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN, 'path must be kebab-case')

const BRIEF_TRUNCATION_SUFFIX = '...'

/**
 * Descriptive prose the planner writes for the generator to read, clamped rather
 * than bounded: a brief that describes a dense app runs past these lengths easily,
 * and failing the whole plan over one long sentence costs two model calls and
 * discards the sitemap. Identifiers are never clamped — a truncated path, action
 * id, or apiKey would silently break the wiring, so those still fail validation.
 */
function briefProse(maxLength: number) {
  return z
    .string()
    .min(1)
    .transform((value) =>
      truncate(value.trim(), maxLength - BRIEF_TRUNCATION_SUFFIX.length, BRIEF_TRUNCATION_SUFFIX)
    )
}

const structuredBriefPageSchema = z.object({
  path: pagePathSchema,
  title: briefProse(80),
  purpose: briefProse(400),
  /** How the page gets its data: onLoad, CTA navigation, or static. */
  data: briefProse(400),
  actions: z.array(z.string().min(1).max(64)).max(8).default([]),
  emptyCopy: briefProse(200).optional(),
})

const structuredBriefActionSchema = z.object({
  id: z.string().min(1).max(64),
  apiKey: z.string().min(1).max(64),
  fromPage: pagePathSchema,
  purpose: briefProse(400),
  onSuccessNavigate: z.string().max(80).nullable().optional(),
})

const structuredBriefSchema = z.object({
  title: briefProse(80),
  purpose: briefProse(400),
  audience: briefProse(200),
  archetype: z.enum(ARENA_GENERATIVE_ARCHETYPES),
  entryPath: pagePathSchema,
  pages: z.array(structuredBriefPageSchema).min(1).max(8),
  actions: z.array(structuredBriefActionSchema).max(16).default([]),
  emptyCopy: briefProse(200).optional(),
  errorCopy: briefProse(200).optional(),
})

export type ArenaGenerativeStructuredBrief = z.output<typeof structuredBriefSchema>

const PLANNER_SYSTEM_PROMPT = [
  'You plan multi-page Arena apps. Output one JSON object. No markdown fences, no explanation.',
  'Pick exactly one archetype:',
  '- dashboard: data on arrival via onLoad; EntityHeader, Grid of display Stat, little or no form.',
  '- form-result: a form submits a CTA, then onSuccess.navigate to a results page. A single query field is a centered SearchField hero. Loading and empty copy live on results.',
  '- list-detail: a collection of entity Cards (Repeat inside Grid) and a detail page opened with to "detail?id={item.id}" whose onLoad fetches that record.',
  '- wizard: three or more sequential steps with Next/Back; submit only on the last step.',
  'Shape: { "title", "purpose", "audience", "archetype", "entryPath", "pages": [{ "path", "title", "purpose", "data", "actions", "emptyCopy"? }], "actions": [{ "id", "apiKey", "fromPage", "purpose", "onSuccessNavigate" }], "emptyCopy"?, "errorCopy"? }',
  'pages[].path, entryPath, and actions[].fromPage are bare kebab-case keys — "home", "select-company" — never URL routes: no leading slash, no "/" for the entry page, no nested segments. Call the entry page "home" unless the brief names it.',
  '1–6 pages. data is one sentence (onLoad which action into which state keys, or CTA then navigate, or static).',
  'A dashboard, list, report, or detail page names onLoad in data. A form page does not.',
  "emptyCopy is the zero-result sentence for that page's collection (becomes emptyText). errorCopy is the failure sentence.",
  'actions[].apiKey must be a declared binding key. When no bindings were declared, actions must be [].',
  'Give an onLoad action no onSuccessNavigate.',
].join('\n')

const ARCHETYPE_RECIPES: Record<ArenaGenerativeArchetype, string> = {
  dashboard: [
    'ARCHETYPE RECIPE: dashboard',
    'Home is EntityHeader (logo, title, badge, description, meta chips) plus Tabs, then a Grid of four Stat with size "display", then a summary Card. Bind metrics by statePath.',
    'Set page onLoad to the fetch action and bind every metric and collection; do not hard-code those values. Do not put a parameters form beside the metrics unless the brief asked for one.',
    'Filters belong in a Toolbar. Extra top-level pages use Tabs. No form unless the brief asked for one.',
  ].join('\n'),
  'form-result': [
    'ARCHETYPE RECIPE: form-result',
    'If the form is a single prominent query field, home is a centered PageHeader (kicker, display title, measure subtitle) plus SearchField with suggestion Chips and a Grid of three Icon Cards. Do not use a labelled Grid for that query.',
    'Multi-field forms stay a left-aligned PageHeader plus fields in a 2-column Grid, one SubmitButton, no onLoad.',
    'The submit action sets onSuccess.navigate to the results path. Results binds Repeat entity Cards, Stat, KeyValue, or DataText to the response keys and offers a Back NavLink.',
    'Loading and emptyText live on the results page — the host navigates there while the action is still pending. A run-progress page uses EntityHeader, ProgressBar, and nested ProgressSteps while pending.',
  ].join('\n'),
  'list-detail': [
    'ARCHETYPE RECIPE: list-detail',
    'List page onLoad fills Repeat inside a 2-column Grid of entity Cards (Avatar, title, subtitle, truncated description, footerText, footer Analyze Button) — not a Table — when items have a name, description, and action. Use Table only when every row is the same scalars with no per-row action. Each Card uses NavLink.to or Button.navigateTo "detail?id={item.id}" — never unroll the array into static Cards.',
    'Detail page onLoad fetches the record (inputMapping id from the query), shows EntityHeader plus KeyValue or display Stats, and a Back NavLink. emptyText names the collection.',
    'Give those onLoad actions no onSuccess.navigate.',
  ].join('\n'),
  wizard: [
    'ARCHETYPE RECIPE: wizard',
    'One page per step. Each step except the last is a Form fragment with a Next Button.navigateTo the following path; the last step has the SubmitButton.',
    'Steps after the first have a Back NavLink. Do not dump every field onto a single page when the brief described steps.',
    'Tabs are fine when there are three or more top-level steps.',
  ].join('\n'),
}

export interface PlanStructuredBriefParams {
  userInput: string
  pages?: ArenaGenerativePageHint[]
  entryPath?: string
  apiBindings: ArenaGenerativeApiBinding[]
  designNotes?: string
}

/**
 * Recipe appended to the manifest-generation system prompt once a structured
 * brief has picked an archetype, so the few-shot is not always the dashboard.
 */
export function archetypeRecipe(archetype: ArenaGenerativeArchetype): string {
  return ARCHETYPE_RECIPES[archetype]
}

/**
 * Sitemap hints taken from a planned brief, used as the generator contract
 * when the user did not pin Pages.
 */
export function pageHintsFromStructuredBrief(
  brief: ArenaGenerativeStructuredBrief
): ArenaGenerativePageHint[] {
  return brief.pages.map((page) => ({
    path: page.path,
    title: page.title,
    purpose: page.purpose,
  }))
}

/**
 * Serialises the planned IA for the manifest-generation user payload.
 */
export function formatStructuredBriefForGenerator(brief: ArenaGenerativeStructuredBrief): string {
  return [
    'Structured brief (implement this information architecture; emit exactly these page paths as object keys):',
    JSON.stringify(brief, null, 2),
    "Honour onLoad vs CTA as each page's data field describes. Use that page's emptyCopy as emptyText on its collection.",
  ].join('\n')
}

/** Page key used when a planner names the entry page "/" or leaves it empty. */
const ROOT_PAGE_PATH = 'home'

/**
 * Planners describe a sitemap in web-route language — `"/"`, `"/select-company"`,
 * `"/company/analysis"` — but a page key here is one bare kebab-case segment, so
 * every such path fails {@link pagePathSchema}. The repair turn cannot fix it
 * either: there is no kebab-case spelling of `"/"`, so the brief was rejected
 * twice and the run fell back to prose after two wasted model calls. Normalising
 * keeps the planned sitemap instead of discarding it.
 */
function normalizePagePath(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[\s_/]+/g, '-')
    .replace(/-{2,}/g, '-')
  return normalized || ROOT_PAGE_PATH
}

/**
 * Same normalisation for a navigation target, which may carry a query string
 * (`"/report?range=30d"`). An empty target means "do not navigate" and is left
 * alone rather than being turned into the root page.
 */
function normalizeNavTarget(value: unknown): unknown {
  if (typeof value !== 'string' || !value.trim()) {
    return value
  }
  const queryIndex = value.indexOf('?')
  const path = queryIndex < 0 ? value : value.slice(0, queryIndex)
  const query = queryIndex < 0 ? '' : value.slice(queryIndex)
  const normalized = normalizePagePath(path)
  return typeof normalized === 'string' ? `${normalized}${query}` : value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Rewrites every path-shaped field of a raw planner reply before validation. */
function normalizeBriefPaths(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }
  const normalized: Record<string, unknown> = { ...value }
  if ('entryPath' in value) {
    normalized.entryPath = normalizePagePath(value.entryPath)
  }
  if (Array.isArray(value.pages)) {
    normalized.pages = value.pages.map((page) =>
      isRecord(page) && 'path' in page ? { ...page, path: normalizePagePath(page.path) } : page
    )
  }
  if (Array.isArray(value.actions)) {
    normalized.actions = value.actions.map((action) => {
      if (!isRecord(action)) {
        return action
      }
      return {
        ...action,
        ...('fromPage' in action ? { fromPage: normalizePagePath(action.fromPage) } : {}),
        ...('onSuccessNavigate' in action
          ? { onSuccessNavigate: normalizeNavTarget(action.onSuccessNavigate) }
          : {}),
      }
    })
  }
  return normalized
}

/**
 * Validates a model JSON object as a structured brief. Path-shaped fields are
 * normalised to bare kebab-case keys first. Extra keys are stripped.
 */
export function parseArenaGenerativeStructuredBrief(
  value: unknown,
  options: {
    pageHints?: ArenaGenerativePageHint[]
    entryPath?: string
    apiBindings: ArenaGenerativeApiBinding[]
  }
): ArenaGenerativeStructuredBrief | null {
  const parsed = structuredBriefSchema.safeParse(normalizeBriefPaths(value))
  if (!parsed.success) {
    return null
  }
  let brief = parsed.data
  const bindingKeys = new Set(options.apiBindings.map((binding) => binding.key).filter(Boolean))
  if (bindingKeys.size === 0) {
    brief = { ...brief, actions: [] }
  } else {
    const actions = brief.actions.filter((action) => bindingKeys.has(action.apiKey))
    if (actions.length !== brief.actions.length) {
      brief = { ...brief, actions }
    }
  }
  const hints = options.pageHints?.filter((hint) => hint.path.trim().length > 0) ?? []
  if (hints.length > 0) {
    brief = reconcileBriefWithPageHints(brief, hints, options.entryPath)
  } else if (options.entryPath && brief.pages.some((page) => page.path === options.entryPath)) {
    brief = { ...brief, entryPath: options.entryPath }
  } else if (!brief.pages.some((page) => page.path === brief.entryPath)) {
    const first = brief.pages[0]
    if (!first) return null
    brief = { ...brief, entryPath: first.path }
  }
  return brief
}

function reconcileBriefWithPageHints(
  brief: ArenaGenerativeStructuredBrief,
  hints: ArenaGenerativePageHint[],
  entryPath?: string
): ArenaGenerativeStructuredBrief {
  const byPath = new Map(brief.pages.map((page) => [page.path, page]))
  const pages = hints.map((hint) => {
    const existing = byPath.get(hint.path)
    if (existing) {
      return {
        ...existing,
        title: hint.title.trim() || existing.title,
        purpose: hint.purpose?.trim() || existing.purpose,
      }
    }
    return {
      path: hint.path,
      title: hint.title.trim() || hint.path,
      purpose: hint.purpose?.trim() || `Show ${hint.title.trim() || hint.path}`,
      data: 'static',
      actions: [] as string[],
    }
  })
  const allowed = new Set(pages.map((page) => page.path))
  const first = pages[0]
  if (!first) {
    return brief
  }
  const nextEntry =
    (entryPath && allowed.has(entryPath) && entryPath) ||
    (allowed.has(brief.entryPath) ? brief.entryPath : first.path)
  return {
    ...brief,
    pages,
    entryPath: nextEntry,
    actions: brief.actions.filter((action) => allowed.has(action.fromPage)),
  }
}

function extractMessageText(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

function plannerUserPayload(params: PlanStructuredBriefParams): string {
  const pageHints = params.pages?.filter((page) => page.path.trim().length > 0) ?? []
  const bindingKeys = params.apiBindings.map((binding) => binding.key).filter(Boolean)
  const bindingsSummary = params.apiBindings.map((binding) => ({
    key: binding.key,
    label: binding.label,
    kind: binding.kind,
    inputSchema: binding.inputSchema ?? [],
    outputSchema: binding.outputSchema ?? [],
    stream: binding.stream === true,
  }))
  return [
    'Mode: plan a new multi-page app. Do not emit page specs or a manifest.',
    params.entryPath ? `Requested entryPath: ${params.entryPath}` : '',
    pageHints.length > 0
      ? `Requested pages (use exactly these paths):\n${JSON.stringify(pageHints, null, 2)}`
      : 'No explicit page list. Infer a small coherent sitemap from the brief.',
    bindingKeys.length > 0
      ? `Declared API bindings (actions may only use these keys):\n${JSON.stringify(bindingsSummary, null, 2)}`
      : 'No API bindings. actions must be an empty array. Navigation and static content only.',
    params.designNotes?.trim() ? `Design notes:\n${params.designNotes.trim()}` : '',
    `User request:\n${params.userInput.trim()}`,
  ]
    .filter((section) => section.length > 0)
    .join('\n\n')
}

const BRIEF_REPAIR_USER_MESSAGE =
  'That was not a valid structured brief. Return one JSON object in the planner shape (title, purpose, audience, archetype, entryPath, pages[], actions[]). Do not emit a manifest.'

/**
 * Cheap first-stage call: invents sitemap, archetype, and per-page data/actions
 * so the manifest call spends its budget on JSON rather than IA. Returns null
 * on any failure so generate can fall back to the prose brief.
 */
export async function planArenaGenerativeStructuredBrief(
  params: PlanStructuredBriefParams
): Promise<ArenaGenerativeStructuredBrief | null> {
  const userInput = params.userInput.trim()
  if (!userInput) {
    return null
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
      max_tokens: Math.min(getMaxOutputTokensForModel(modelId), BRIEF_OUTPUT_TOKENS),
      ...(supportsTemperature(modelId) ? { temperature: 0.2 } : {}),
      system: PLANNER_SYSTEM_PROMPT,
    }
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: plannerUserPayload(params) },
    ]
    const parseOptions = {
      pageHints: params.pages,
      entryPath: params.entryPath,
      apiBindings: params.apiBindings,
    }

    for (let attempt = 0; attempt < MAX_BRIEF_ATTEMPTS; attempt += 1) {
      const message = await createAnthropicMessage(anthropic, { ...messageOptions, messages })
      const rawText = extractMessageText(message)
      if (!rawText) {
        continue
      }
      let brief: ArenaGenerativeStructuredBrief | null = null
      try {
        const parsed = parseLlmJsonObject(rawText)
        brief = parseArenaGenerativeStructuredBrief(parsed, parseOptions)
      } catch {
        brief = null
      }
      if (brief) {
        return brief
      }
      if (attempt + 1 < MAX_BRIEF_ATTEMPTS) {
        messages.push(
          { role: 'assistant', content: rawText },
          { role: 'user', content: BRIEF_REPAIR_USER_MESSAGE }
        )
      }
    }
    logger.warn('Arena Generative UI structured brief was unusable; generating from prose')
    return null
  } catch (error) {
    logger.warn('Arena Generative UI structured brief planning failed; generating from prose', {
      error: toError(error).message,
    })
    return null
  }
}
