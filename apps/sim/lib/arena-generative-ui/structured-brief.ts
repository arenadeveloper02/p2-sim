import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { omit } from '@sim/utils/object'
import { truncate } from '@sim/utils/string'
import { z } from 'zod'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import { bindingsSummaryForPrompt } from '@/lib/arena-generative-ui/bindings-prompt'
import {
  ARENA_GENERATIVE_CAPABILITIES,
  type ArenaGenerativeCapability,
  isCapability,
} from '@/lib/arena-generative-ui/capabilities'
import { ARENA_GENERATIVE_UI_PLANNER_DS_CONTEXT } from '@/lib/arena-generative-ui/catalog'
import {
  type ArenaGenerativeDesignIntent,
  parseArenaGenerativeDesignIntent,
} from '@/lib/arena-generative-ui/design-intent'
import {
  type ArenaGenerativeIntent,
  arenaGenerativeIntentSchema,
} from '@/lib/arena-generative-ui/intent-analyzer'
import { parseLlmJsonObject } from '@/lib/arena-generative-ui/parse-inputs'
import { isProcessingPattern } from '@/lib/arena-generative-ui/processing-patterns'
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
  capabilities: z
    .array(z.string())
    .max(12)
    .default([])
    .transform((values) => values.filter(isCapability)),
  processing: z
    .array(z.string())
    .max(5)
    .default([])
    .transform((values) => values.filter(isProcessingPattern)),
  emptyCopy: briefProse(200).optional(),
  errorCopy: briefProse(200).optional(),
  intent: arenaGenerativeIntentSchema.optional(),
  designIntent: z.unknown().optional(),
  informationHierarchy: z.unknown().optional(),
  interactionModel: z.unknown().optional(),
})

export const ARENA_GENERATIVE_HIERARCHY_DOMINANTS = [
  'form',
  'collection',
  'metrics',
  'prose',
  'wizard-step',
] as const

export const ARENA_GENERATIVE_HIERARCHY_SUPPORTING = [
  'filters',
  'history',
  'sidebar',
  'detail',
  'stats',
] as const

export const ARENA_GENERATIVE_NAVIGATION_PATTERNS = [
  'search-hero',
  'tabs',
  'list-detail',
  'wizard',
  'single-page',
] as const

export const ARENA_GENERATIVE_SELECTION_PATTERNS = ['none', 'same-page', 'navigate'] as const

export const ARENA_GENERATIVE_WAIT_PATTERNS = ['none', 'working-card'] as const

export type ArenaGenerativeHierarchyDominant =
  (typeof ARENA_GENERATIVE_HIERARCHY_DOMINANTS)[number]
export type ArenaGenerativeHierarchySupporting =
  (typeof ARENA_GENERATIVE_HIERARCHY_SUPPORTING)[number]
export type ArenaGenerativeNavigationPattern =
  (typeof ARENA_GENERATIVE_NAVIGATION_PATTERNS)[number]
export type ArenaGenerativeSelectionPattern = (typeof ARENA_GENERATIVE_SELECTION_PATTERNS)[number]
export type ArenaGenerativeWaitPattern = (typeof ARENA_GENERATIVE_WAIT_PATTERNS)[number]

export interface ArenaGenerativeInformationHierarchy {
  dominant?: ArenaGenerativeHierarchyDominant
  supporting?: ArenaGenerativeHierarchySupporting[]
}

export interface ArenaGenerativeInteractionModel {
  navigation?: ArenaGenerativeNavigationPattern
  selection?: ArenaGenerativeSelectionPattern
  wait?: ArenaGenerativeWaitPattern
}

function asClosedEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  if (typeof value !== 'string') return undefined
  if ((allowed as readonly string[]).includes(value)) return value as T
  const kebab = value.replace(/_/g, '-')
  return (allowed as readonly string[]).includes(kebab) ? (kebab as T) : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function liftSnakeCasePlanFields(value: unknown): unknown {
  if (!isRecord(value)) return value
  const next: Record<string, unknown> = { ...value }
  if (next.informationHierarchy == null && next.information_hierarchy != null) {
    next.informationHierarchy = next.information_hierarchy
  }
  if (next.interactionModel == null && next.interaction_model != null) {
    next.interactionModel = next.interaction_model
  }
  return next
}

/** Fail-open parse for the planner information-hierarchy card. */
export function parseArenaGenerativeInformationHierarchy(
  value: unknown
): ArenaGenerativeInformationHierarchy | undefined {
  if (!isRecord(value)) return undefined
  const hierarchy: ArenaGenerativeInformationHierarchy = {}
  const dominant = asClosedEnum(value.dominant, ARENA_GENERATIVE_HIERARCHY_DOMINANTS)
  if (dominant) hierarchy.dominant = dominant
  const rawSupporting = value.supporting
  if (Array.isArray(rawSupporting)) {
    const supporting: ArenaGenerativeHierarchySupporting[] = []
    const seen = new Set<ArenaGenerativeHierarchySupporting>()
    for (const item of rawSupporting) {
      const next = asClosedEnum(item, ARENA_GENERATIVE_HIERARCHY_SUPPORTING)
      if (next && !seen.has(next)) {
        seen.add(next)
        supporting.push(next)
      }
    }
    if (supporting.length > 0) hierarchy.supporting = supporting
  }
  return Object.keys(hierarchy).length > 0 ? hierarchy : undefined
}

/** Fail-open parse for the planner interaction-model card. */
export function parseArenaGenerativeInteractionModel(
  value: unknown
): ArenaGenerativeInteractionModel | undefined {
  if (!isRecord(value)) return undefined
  const model: ArenaGenerativeInteractionModel = {}
  const navigation = asClosedEnum(value.navigation, ARENA_GENERATIVE_NAVIGATION_PATTERNS)
  if (navigation) model.navigation = navigation
  const selection = asClosedEnum(value.selection, ARENA_GENERATIVE_SELECTION_PATTERNS)
  if (selection) model.selection = selection
  const wait = asClosedEnum(value.wait, ARENA_GENERATIVE_WAIT_PATTERNS)
  if (wait) model.wait = wait
  return Object.keys(model).length > 0 ? model : undefined
}

export type ArenaGenerativeStructuredBrief = Omit<
  z.output<typeof structuredBriefSchema>,
  'designIntent' | 'informationHierarchy' | 'interactionModel'
> & {
  designIntent?: ArenaGenerativeDesignIntent
  informationHierarchy?: ArenaGenerativeInformationHierarchy
  interactionModel?: ArenaGenerativeInteractionModel
}

function withParsedPlanClassifiers(
  brief: z.output<typeof structuredBriefSchema>
): ArenaGenerativeStructuredBrief {
  const designIntent = parseArenaGenerativeDesignIntent(brief.designIntent)
  const informationHierarchy = parseArenaGenerativeInformationHierarchy(brief.informationHierarchy)
  const interactionModel = parseArenaGenerativeInteractionModel(brief.interactionModel)
  return {
    ...omit(brief, ['designIntent', 'informationHierarchy', 'interactionModel']),
    ...(designIntent ? { designIntent } : {}),
    ...(informationHierarchy ? { informationHierarchy } : {}),
    ...(interactionModel ? { interactionModel } : {}),
  }
}

const PLANNER_SYSTEM_PROMPT = [
  'You plan the sitemap for a multi-page Arena app. Output one JSON object. No markdown fences, no explanation.',
  'When Analyzed intent is present, honour its task, entities, actions, and complexity — do not rewrite the job. Pick the archetype, pages, capabilities, designIntent, informationHierarchy, and interactionModel that implement that intent.',
  'When intent is absent, read User request, declared bindings, Design notes, and any pinned pages together. Honour every name, label, CTA key, field, and navigation the user DID write. Infer only sitemap, archetype, capabilities, designIntent, informationHierarchy, and interactionModel.',
  'Pick exactly one archetype:',
  '- dashboard: data on arrival via onLoad; EntityHeader, Grid of display Stat, little or no form.',
  '- form-result: form → processing → result. A form submits a CTA, processing happens, then onSuccess.navigate to a results page. A single query field is a centered SearchField hero. Empty copy lives on results.',
  '- list-detail: a collection of entity Cards (Repeat inside Grid) and a detail page opened with to "detail?id={item.id}" whose onLoad fetches that record.',
  '- wizard: three or more sequential steps with Next/Back; submit only on the last step.',
  'Archetype from the primary verb (or intent.workflowComplexity), not from how complete the brief is. A form or search that calls an API then shows an answer is form-result even if they never said "results page". A collection on arrival that opens one record is list-detail even if they only named the list. Metrics/overview on arrival is dashboard. Three or more sequential steps with submit at the end is wizard. Mixed briefs ("dashboard plus generate"): pick the verb they led with; extra destinations are extra pages, not a second archetype. History or past runs plus a generate form is form-result with a history page that onLoads the list binding — Generate still navigates to results. One prominent query (search, lookup, ask) is a SearchField hero, not a labelled Grid of one field.',
  'Set capabilities to the tags that apply (zero or more): long-running, streaming, multi-step, cancellable, search, filter, pagination, selection, editable. Combine them. A workflow binding is long-running; stream: true is streaming; a named step checklist is multi-step; Cancel in the brief is cancellable; a single prominent query is search; Toolbar narrowing is filter; binding.pagination is pagination; opening a row that already has prose is selection; edit-in-place is editable. Omit tags the job does not need. Do not emit "short".',
  'Also emit designIntent { productType, density, visualTone, contentType, emphasis } — pick one of each. Honour Design Notes first. Else derive from archetype plus brief nouns: dashboard → analytics / compact / data-heavy / data; form-result → workflow / comfortable / task; list-detail → crm / comfortable / discovery; wizard → workflow / comfortable / task. Override productType from domain words (invoices → finance, campaigns → marketing). density is compact | comfortable | roomy (spacious means roomy). visualTone is professional | friendly | premium | technical | editorial. contentType is data-heavy | workflow | narrative | transactional. emphasis is task | data | content | discovery. Classification only — not component props.',
  'Also emit informationHierarchy { dominant, supporting? } and interactionModel { navigation, selection, wait }. Honour Design Notes first. Else derive from archetype plus capabilities: dashboard → metrics / tabs / none; form-result → form / search-hero or single-page / working-card if a wait capability is set; list-detail → collection / list-detail / navigate or same-page; wizard → wizard-step / wizard / none. dominant is form | collection | metrics | prose | wizard-step. supporting is zero or more of filters, history, sidebar, detail, stats. navigation is search-hero | tabs | list-detail | wizard | single-page. selection is none | same-page | navigate. wait is none | working-card — working-card only when a wait capability is set. Classification only — not component props.',
  'Shape: { "title", "purpose", "audience", "archetype", "entryPath", "pages": [{ "path", "title", "purpose", "data", "actions", "emptyCopy"? }], "actions": [{ "id", "apiKey", "fromPage", "purpose", "onSuccessNavigate" }], "capabilities"?: ("long-running"|"streaming"|"multi-step"|"cancellable"|"search"|"filter"|"pagination"|"selection"|"editable")[], "designIntent"?: { "productType", "density", "visualTone", "contentType", "emphasis" }, "informationHierarchy"?: { "dominant", "supporting"? }, "interactionModel"?: { "navigation", "selection", "wait" }, "emptyCopy"?, "errorCopy"? }',
  'title is the product name. purpose is the job in one sentence (copy intent.task when present). audience is a real role — never "users".',
  'pages[].path, entryPath, and actions[].fromPage are bare kebab-case keys — "home", "select-company" — never URL routes: no leading slash, no "/" for the entry page, no nested segments. Call the entry page "home" unless the brief names it.',
  '1–6 pages. Infer the smallest sitemap that completes the job: form-result always has a destination for the answer plus Back; list-detail always has a way to open a record (detail page, or same-page Open when the row already carries prose); a second binding that is a list/history is a collection page with onLoad, not a second submit. Do not invent login, settings, profile, marketing, or extra tools the job does not need.',
  'data is one sentence (onLoad which action into which state keys, or CTA then navigate, or static).',
  'A dashboard, list, report, or detail page names onLoad in data. A form page does not. A results page that a CTA already navigates to must not onLoad that same action.',
  'Bindings are the data contract. Form fields come from each binding inputSchema (source form or omitted); source visitorEmail or constant are host-stamped — do not plan a visible field for them. Wire each CTA to the binding whose key the brief named, or the one whose inputs/outputs match the job when the brief only described it in words. actions[].apiKey must be a declared binding key. When no bindings were declared, actions must be [].',
  'When a binding has no outputSchema, do not plan Table or Stat columns; results are prose (DataText content) unless the brief names exact keys. When layoutPlan or outputSchema names a collection, plan Repeat/Table/Stat against those host keys, not invented ones.',
  'emptyCopy is the zero-result sentence for that page\'s collection (becomes emptyText) — name the collection in the domain, not generic "No results". errorCopy is the failure sentence for this job.',
  'Give an onLoad action no onSuccessNavigate.',
  'Plan sitemap, data, actions, and capabilities — not loading widgets. Do not mention ProgressBar, ProgressSteps, Skeleton, or an error Alert in pages[].purpose or data; the host compiles those.',
  ARENA_GENERATIVE_UI_PLANNER_DS_CONTEXT,
].join('\n')

const ARCHETYPE_RECIPES: Record<ArenaGenerativeArchetype, string> = {
  dashboard: [
    'ARCHETYPE RECIPE: dashboard',
    'Home is EntityHeader (logo, title, badge, description, meta chips) plus Tabs, then a Grid of four Stat with size "display", an optional Sparkline trend, then a summary Card. Bind metrics by statePath.',
    'Set page onLoad to the fetch action and bind every metric and collection; do not hard-code those values. Do not put a parameters form beside the metrics unless the brief asked for one.',
    'Filters belong in a Toolbar. Extra top-level pages use Tabs. No form unless the brief asked for one.',
  ].join('\n'),
  'form-result': [
    'ARCHETYPE RECIPE: form-result',
    'form → processing → result. The wait itself is CAPABILITY (long-running, streaming, multi-step, cancellable) — compose those modules; do not invent a second wait.',
    'form — If the form is a single prominent query field, home is a centered PageHeader (kicker, display title, measure subtitle) plus SearchField with suggestion Chips and a Grid of three Icon Cards. Do not use a labelled Grid for that query. Multi-field forms stay a left-aligned PageHeader plus fields in a 2-column Grid, one SubmitButton. No onLoad. The form stays fields plus submit until click.',
    'processing — The submit action sets onSuccess.navigate to the results path. Waiting chrome lives on the destination, never on the form. Which wait is CAPABILITY.',
    'result — Results has no onLoad of that CTA. Bind a markdown string on DataText "content" (or the string field name), never "field.content". Repeat entity Cards, Stat, or KeyValue bind structured keys. Echo submitted fields from the form name ({targetKeyword}, inputs.targetKeyword), not a history list key ({keyword}). emptyText lives here. Offer a Back NavLink.',
  ].join('\n'),
  'list-detail': [
    'ARCHETYPE RECIPE: list-detail',
    'List page onLoad fills Repeat inside a 2-column Grid of entity Cards (Avatar, title, subtitle, truncated description, footerText, footer Analyze Button) — not a Table — when items have a name, description, and action. Use Table only when every row is the same scalars with no per-row action. Each Card uses NavLink.to or Button.navigateTo "detail?id={item.id}" — never unroll the array into static Cards.',
    'When list items already include the detail/prose field (output, content, body), Open is Button selectItem true with no actionId. It copies prose to content, not inputs. Stay on the list page: omit navigateTo, hide Repeat with showWhen "!selectedId", show markdown in a sibling Section showWhen "selectedId" with a ghost Back clearItem true. Or navigateTo a separate results page that has no onLoad — do not bind that field inside Repeat, do not invent a second fetch. Results after a form Generate still echo the form names, not item.keyword.',
    'Detail page onLoad fetches the record (inputMapping id from the query), shows EntityHeader plus KeyValue or display Stats, and a Back NavLink. emptyText names the collection. Skip that onLoad when selectItem already copied the row.',
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
  /** Output of the intent analyzer. Absent when analysis failed open. */
  intent?: ArenaGenerativeIntent | null
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
    "Honour onLoad vs CTA as each page's data field describes. Use that page's emptyCopy as emptyText on its collection. Keep this sitemap and wiring; fill in labels, grouping, and Back links a senior engineer would not skip.",
  ].join('\n')
}

/**
 * Same IA for an edit: context only. Pinning the sitemap here would reject a
 * change request that adds or removes a page.
 */
export function formatStructuredBriefForEdit(brief: ArenaGenerativeStructuredBrief): string {
  return [
    'Original structured brief (context only — already implemented. Do not re-apply the sitemap, archetype, or copy unless the change request asks.):',
    JSON.stringify(brief, null, 2),
  ].join('\n')
}

/**
 * Legacy `processing` wait tags become `capabilities` so old drafts still edit.
 */
function foldProcessingIntoCapabilities(
  brief: ArenaGenerativeStructuredBrief
): ArenaGenerativeStructuredBrief {
  const selected = new Set<ArenaGenerativeCapability>(brief.capabilities)
  for (const raw of brief.processing) {
    if (isCapability(raw)) selected.add(raw)
  }
  const capabilities = ARENA_GENERATIVE_CAPABILITIES.filter((capability) =>
    selected.has(capability)
  )
  if (
    capabilities.length === brief.capabilities.length &&
    capabilities.every((capability, index) => capability === brief.capabilities[index])
  ) {
    return brief
  }
  return { ...brief, capabilities }
}

/**
 * Reads a draft-stored structured brief. Invalid JSON is ignored so old or
 * partial rows still edit. Legacy `processing` folds into `capabilities`.
 */
export function parseStoredStructuredBrief(value: unknown): ArenaGenerativeStructuredBrief | null {
  const parsed = structuredBriefSchema.safeParse(liftSnakeCasePlanFields(value))
  return parsed.success
    ? foldProcessingIntoCapabilities(withParsedPlanClassifiers(parsed.data))
    : null
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

/** Rewrites every path-shaped field of a raw planner reply before validation. */
function normalizeBriefPaths(value: unknown): unknown {
  const lifted = liftSnakeCasePlanFields(value)
  if (!isRecord(lifted)) {
    return lifted
  }
  const normalized: Record<string, unknown> = { ...lifted }
  if ('entryPath' in lifted) {
    normalized.entryPath = normalizePagePath(lifted.entryPath)
  }
  if (Array.isArray(lifted.pages)) {
    normalized.pages = lifted.pages.map((page) =>
      isRecord(page) && 'path' in page ? { ...page, path: normalizePagePath(page.path) } : page
    )
  }
  if (Array.isArray(lifted.actions)) {
    normalized.actions = lifted.actions.map((action) => {
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
  return foldProcessingIntoCapabilities(omit(withParsedPlanClassifiers(brief), ['intent']))
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
  const bindingsSummary = bindingsSummaryForPrompt(params.apiBindings)
  const intentSection = params.intent
    ? `Analyzed intent (honour this; pick sitemap and capabilities, do not rewrite the job):\n${JSON.stringify(params.intent)}`
    : 'No analyzed intent. Infer the job, audience, sitemap, and capabilities from User request. Bindings are the data contract. Never invent API keys.'
  return [
    'Mode: plan a new multi-page app. Do not emit page specs or a manifest.',
    intentSection,
    params.entryPath ? `Requested entryPath: ${params.entryPath}` : '',
    pageHints.length > 0
      ? `Requested pages (use exactly these paths):\n${JSON.stringify(pageHints, null, 2)}`
      : 'No explicit page list. Infer a small coherent sitemap from the brief — include destination and collection pages the job needs even if the user only named the starting screen.',
    bindingKeys.length > 0
      ? `Declared API bindings (actions may only use these keys; inputSchema is the form, outputSchema/layoutPlan is the result):\n${JSON.stringify(bindingsSummary, null, 2)}`
      : 'No API bindings. actions must be an empty array. Navigation and static content only.',
    params.designNotes?.trim() ? `Design notes:\n${params.designNotes.trim()}` : '',
    `User request:\n${params.userInput.trim()}`,
  ]
    .filter((section) => section.length > 0)
    .join('\n\n')
}

const BRIEF_REPAIR_USER_MESSAGE =
  'That was not a valid structured brief. Return one JSON object in the planner shape (title, purpose, audience, archetype, entryPath, pages[], actions[], capabilities?, designIntent?, informationHierarchy?, interactionModel?). Do not emit a manifest.'

export type PlanStructuredBriefOutcome = {
  brief: ArenaGenerativeStructuredBrief | null
  error?: string
}

/**
 * Cheap UI planner: sitemap, archetype, per-page data/actions, capabilities,
 * designIntent, informationHierarchy, and interactionModel. Consumes analyzed
 * intent when present. Returns `{ brief: null, error }` on failure so generate
 * can fall back to prose.
 */
export async function planArenaGenerativeStructuredBrief(
  params: PlanStructuredBriefParams
): Promise<PlanStructuredBriefOutcome> {
  const userInput = params.userInput.trim()
  if (!userInput) {
    return { brief: null, error: 'userInput is required' }
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
        return {
          brief: params.intent ? { ...brief, intent: params.intent } : brief,
        }
      }
      if (attempt + 1 < MAX_BRIEF_ATTEMPTS) {
        messages.push(
          { role: 'assistant', content: rawText },
          { role: 'user', content: BRIEF_REPAIR_USER_MESSAGE }
        )
      }
    }
    logger.warn('Arena Generative UI structured brief was unusable; generating from prose')
    return { brief: null, error: 'Planner reply was not a valid structured brief' }
  } catch (error) {
    logger.warn('Arena Generative UI structured brief planning failed; generating from prose', {
      error: toError(error).message,
    })
    return { brief: null, error: toError(error).message }
  }
}
