import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { omit } from '@sim/utils/object'
import { truncate } from '@sim/utils/string'
import { z } from 'zod'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import { bindingsSummaryForPrompt } from '@/lib/arena-generative-ui/bindings-prompt'
import {
  type ArenaGenerativeCapability,
  isCapability,
  plannedCapabilities,
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
  'workspace',
  'collection',
  'detail',
  'task',
  'results',
  'dashboard',
  'workflow',
  'content',
] as const

export type ArenaGenerativeArchetype = (typeof ARENA_GENERATIVE_ARCHETYPES)[number]

/** Stored / planner aliases so old drafts still parse. */
export const ARENA_GENERATIVE_ARCHETYPE_ALIASES = {
  'list-detail': 'collection',
  'form-result': 'task',
  wizard: 'workflow',
} as const

const ARCHETYPE_SET = new Set<string>(ARENA_GENERATIVE_ARCHETYPES)

/**
 * Maps a raw planner/stored archetype onto the closed enum. Compound product
 * names become the entry page shape.
 */
export function canonicalizeArchetype(value: unknown): ArenaGenerativeArchetype | undefined {
  if (typeof value !== 'string') return undefined
  if (ARCHETYPE_SET.has(value)) return value as ArenaGenerativeArchetype
  const aliased = ARENA_GENERATIVE_ARCHETYPE_ALIASES[value as keyof typeof ARENA_GENERATIVE_ARCHETYPE_ALIASES]
  return aliased
}

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

const pageShapeSchema = z.enum(ARENA_GENERATIVE_ARCHETYPES)

const structuredBriefRegionSchema = z.object({
  archetype: pageShapeSchema,
  purpose: briefProse(400),
  data: briefProse(400),
  capabilities: z
    .array(z.string())
    .max(8)
    .default([])
    .transform((values) => plannedCapabilities(values)),
})

const structuredBriefRegionsSchema = z.object({
  navigator: structuredBriefRegionSchema.optional(),
  primary: structuredBriefRegionSchema,
  inspector: structuredBriefRegionSchema.optional(),
})

const structuredBriefPageSchema = z.object({
  path: pagePathSchema,
  title: briefProse(80),
  purpose: briefProse(400),
  /** How the page gets its data: onLoad, CTA navigation, or static. */
  data: briefProse(400),
  actions: z.array(z.string().min(1).max(64)).max(8).default([]),
  emptyCopy: briefProse(200).optional(),
  /** Structural shape of this page. Defaults to the app archetype. */
  archetype: pageShapeSchema.optional(),
  /** Workspace shell regions. Ignored unless this page is workspace. */
  regions: structuredBriefRegionsSchema.optional(),
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
  archetype: pageShapeSchema,
  entryPath: pagePathSchema,
  pages: z.array(structuredBriefPageSchema).min(1).max(8),
  actions: z.array(structuredBriefActionSchema).max(16).default([]),
  capabilities: z
    .array(z.string())
    .max(12)
    .default([])
    .transform((values) => plannedCapabilities(values)),
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
  'document',
  'wizard-step',
] as const

export const ARENA_GENERATIVE_HIERARCHY_SUPPORTING = [
  'filters',
  'history',
  'sidebar',
  'detail',
  'stats',
  'navigator',
  'inspector',
] as const

export const ARENA_GENERATIVE_NAVIGATION_PATTERNS = [
  'search-hero',
  'tabs',
  'list-detail',
  'wizard',
  'workspace',
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

function inferPageArchetype(
  page: Record<string, unknown>,
  rawAppArchetype: unknown,
  appArchetype: ArenaGenerativeArchetype
): ArenaGenerativeArchetype {
  const declared = canonicalizeArchetype(page.archetype)
  if (declared) return declared
  const path = typeof page.path === 'string' ? page.path : ''
  if (rawAppArchetype === 'list-detail') {
    return path === 'detail' || path.endsWith('-detail') ? 'detail' : 'collection'
  }
  if (rawAppArchetype === 'form-result') {
    return path === 'results' || path === 'result' ? 'results' : 'task'
  }
  if (rawAppArchetype === 'wizard') return 'workflow'
  return appArchetype
}

function sanitizeRegion(value: unknown): unknown {
  if (!isRecord(value)) return value
  const archetype = canonicalizeArchetype(value.archetype)
  if (!archetype || archetype === 'workspace') return undefined
  return { ...value, archetype }
}

function sanitizeRegions(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.primary)) return undefined
  const primary = sanitizeRegion(value.primary)
  if (!isRecord(primary)) return undefined
  const navigator = sanitizeRegion(value.navigator)
  const inspector = sanitizeRegion(value.inspector)
  return {
    primary,
    ...(isRecord(navigator) ? { navigator } : {}),
    ...(isRecord(inspector) ? { inspector } : {}),
  }
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
  const rawAppArchetype = next.archetype
  const appArchetype = canonicalizeArchetype(rawAppArchetype)
  if (appArchetype) next.archetype = appArchetype
  if (Array.isArray(next.pages) && appArchetype) {
    next.pages = next.pages.map((page) => {
      if (!isRecord(page)) return page
      const pageArchetype = inferPageArchetype(page, rawAppArchetype, appArchetype)
      const lifted: Record<string, unknown> = { ...page, archetype: pageArchetype }
      if (pageArchetype === 'workspace') {
        const regions = sanitizeRegions(page.regions)
        if (regions) lifted.regions = regions
        else delete lifted.regions
      } else {
        delete lifted.regions
      }
      return lifted
    })
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
  'When Analyzed intent is present, honour its task, entities, actions, and complexity — do not rewrite the job. Pick the app archetype, per-page shapes, capabilities, designIntent, informationHierarchy, and interactionModel that implement that intent.',
  'When intent is absent, read User request, declared bindings, Design notes, and any pinned pages together. Honour every name, label, CTA key, field, and navigation the user DID write. Infer only sitemap, archetype, page shapes, capabilities, designIntent, informationHierarchy, and interactionModel.',
  'Pick exactly one app-level archetype (the entry job). Each page also declares pages[].archetype (the shape of that page). Mixed sitemaps are normal.',
  '- collection: find, inspect, or act on many entities. PageHeader, Toolbar, then a collection body. Table vs Repeat/Cards comes from the data — do not assume Cards.',
  '- detail: one entity record. EntityHeader, primary facts, sections from the data model, related data, actions. Not a collection.',
  '- task: the user supplies input to accomplish an action. PageHeader, context, Form or SearchField, one primary action. Results are optional — only add a results page when the CTA produces an answer to show.',
  '- results: analysis or job output. Context, summary, primary result, supporting, actions. Wait chrome is a capability, not this shape.',
  '- dashboard: scan several high-level modules on arrival (onLoad). Header, optional filters, KPI/summary, a primary visualization or module, supporting modules, optional activity. Module count and types come from layoutPlan / outputSchema — never a fixed four Stats. A single Table is collection, not dashboard.',
  '- workflow: sequential stages toward one outcome. Progress, current step (inputs + actions), navigation. Representation from complexity: 2–3 short stages can be one page of sections; a named review/launch can be pages. Not “one page per step” by default. Tabs are not sequential stages (use Stepper). A one-shot form with no stages is task.',
  '- content: a document the user reads or lightly edits (article, proposal, brand guidelines, knowledge). Header, metadata, main markdown body, optional related, actions. An AI report that is the product is content. A one-shot analysis after Generate is results. An entity record is detail.',
  '- workspace: keep several related regions visible at once. One page with regions.navigator, regions.primary (required), regions.inspector?. Each region has its own nested shape (not workspace). Sync via selectedId. Do not use Tabs when simultaneous visibility matters. A single collection, form, analysis, document, or metrics page is not workspace.',
  'Disambiguate from the job, not from how complete the brief is. Scan many modules on arrival → dashboard. Find/act on a list → collection. One entity → detail. Provide input to do a thing → task. Sequential stages → workflow. Output of generate/analyze → results. Read/edit a document as the product → content. Keep several of those visible at once → workspace. Mixed briefs: pick the entry verb; extra destinations are extra pages with their own shape.',
  'Set capabilities to at most five tags that apply: long-running, streaming, multi-step, cancellable, progress, search, filter, sort, pagination, grouping, date-range, refresh, drill-down, selection, detail-drawer, drawer, modal, create, edit, delete, back, skip, review. Combine them. A workflow binding is long-running; stream: true is streaming; binding.pagination is pagination; a single prominent query is search; Toolbar narrowing is filter; a date window is date-range; opening a row that already has prose is selection; keep-the-list-visible is detail-drawer; edit-in-place is edit. Destination shapes are pages[].archetype, not capabilities. Omit tags the job does not need. Do not emit "short", "editable", "export", "generate", or "analyze".',
  'Also emit designIntent { productType, density, visualTone, contentType, emphasis } — pick one of each. Honour Design Notes first. Else derive from archetype plus brief nouns: dashboard → analytics / compact / data-heavy / data; task or results → workflow / comfortable / task; collection → crm / comfortable / discovery; workflow → workflow / comfortable / task; content → content / comfortable / narrative / content; workspace → saas / comfortable / discovery. Override productType from domain words (invoices → finance, campaigns → marketing). density is compact | comfortable | roomy (spacious means roomy). visualTone is professional | friendly | premium | technical | editorial. contentType is data-heavy | workflow | narrative | transactional. emphasis is task | data | content | discovery. Classification only — not component props.',
  'Also emit informationHierarchy { dominant, supporting? } and interactionModel { navigation, selection, wait }. Honour Design Notes first. Else derive from page shapes: dashboard → metrics; collection → collection; task → form; results or content → prose; workflow → wizard-step; workspace → collection with supporting navigator/inspector. dominant is form | collection | metrics | prose | document | wizard-step. supporting is zero or more of filters, history, sidebar, detail, stats, navigator, inspector. navigation is search-hero | tabs | list-detail | wizard | workspace | single-page. selection is none | same-page | navigate. wait is none | working-card — working-card only when a wait capability is set. Classification only — not component props.',
  'Shape: { "title", "purpose", "audience", "archetype", "entryPath", "pages": [{ "path", "title", "purpose", "data", "actions", "emptyCopy"?, "archetype"?, "regions"? }], "actions": [{ "id", "apiKey", "fromPage", "purpose", "onSuccessNavigate" }], "capabilities"?: string[], "designIntent"?: { "productType", "density", "visualTone", "contentType", "emphasis" }, "informationHierarchy"?: { "dominant", "supporting"? }, "interactionModel"?: { "navigation", "selection", "wait" }, "emptyCopy"?, "errorCopy"? }',
  'title is the product name. purpose is the job in one sentence (copy intent.task when present). audience is a real role — never "users".',
  'pages[].path, entryPath, and actions[].fromPage are bare kebab-case keys — "home", "select-company" — never URL routes: no leading slash, no "/" for the entry page, no nested segments. Call the entry page "home" unless the brief names it.',
  '1–6 pages. Infer the smallest sitemap that completes the job: task that produces an answer has a results page plus Back; collection that opens a record has a detail page, or same-page Open / detail-drawer when the row already carries prose; a second binding that is a list/history is a collection page with onLoad, not a second submit. Workspace is usually one page with regions. Do not invent login, settings, profile, marketing, or extra tools the job does not need.',
  'data is one sentence (onLoad which action into which state keys, or CTA then navigate, or static).',
  'A dashboard, collection, report, detail, or content page names onLoad in data when it fetches on arrival. A task form page does not. A results page that a CTA already navigates to must not onLoad that same action.',
  'Bindings are the data contract. Form fields come from each binding inputSchema (source form or omitted); source visitorEmail or constant are host-stamped — do not plan a visible field for them. Wire each CTA to the binding whose key the brief named, or the one whose inputs/outputs match the job when the brief only described it in words. actions[].apiKey must be a declared binding key. When no bindings were declared, actions must be [].',
  'When a binding has no outputSchema, do not plan Table or Stat columns; results are prose (DataText content) unless the brief names exact keys. When layoutPlan or outputSchema names a collection, plan Repeat/Table/Stat against those host keys, not invented ones.',
  'emptyCopy is the zero-result sentence for that page\'s collection (becomes emptyText) — name the collection in the domain, not generic "No results". errorCopy is the failure sentence for this job.',
  'Give an onLoad action no onSuccessNavigate.',
  'Plan sitemap, data, actions, and capabilities — not loading widgets. Do not mention ProgressBar, ProgressSteps, Skeleton, or an error Alert in pages[].purpose or data; the host compiles those.',
  ARENA_GENERATIVE_UI_PLANNER_DS_CONTEXT,
].join('\n')

const ARCHETYPE_RECIPES: Record<ArenaGenerativeArchetype, string> = {
  collection: [
    'ARCHETYPE RECIPE: collection',
    'Slots: PageHeader → Toolbar (search / filters / actions when those capabilities are set) → collection body.',
    'Body is data-driven: Table when every row is the same scalars with no per-row visual identity; Repeat inside Grid of entity Cards when items have a name, description, or per-row action. Never unroll an array into static Cards.',
    'Page onLoad fills the collection. Open a record with navigateTo "detail?id={item.id}" when a Detail page exists, or Button selectItem / Drawer when CAPABILITY includes selection or detail-drawer. Give onLoad actions no onSuccess.navigate.',
  ].join('\n'),
  detail: [
    'ARCHETYPE RECIPE: detail',
    'Slots: EntityHeader → primary facts → sections → related data → actions.',
    'Section content comes from layoutPlan / outputSchema / brief nouns — do not invent a fixed firmographics template. KeyValue or display Stats for scalars; DataText for prose; Repeat/Table for related collections.',
    'When this page is opened with ?id=, onLoad fetches that record (inputMapping id from the query) unless selectItem already copied the row. Back NavLink to the collection. emptyText names the entity.',
  ].join('\n'),
  task: [
    'ARCHETYPE RECIPE: task',
    'Slots: PageHeader → optional context → Input/Form → one primary action.',
    'A single prominent query is a centered PageHeader plus SearchField (suggestion Chips optional). Multi-field forms stay a left-aligned PageHeader plus fields in a 2-column Grid, one SubmitButton. No onLoad on the form page.',
    'Results are optional. When the CTA produces an answer, onSuccess.navigate to a results page and put wait chrome there (CAPABILITY). Same-page saves stay on the form — the host toasts. Do not invent a results page for create/configure that has nothing to show.',
  ].join('\n'),
  results: [
    'ARCHETYPE RECIPE: results',
    'Slots: context/header → summary → primary result → supporting results → actions.',
    'No onLoad of the CTA that already navigated here. Bind markdown on DataText "content" (or the string field name), never "field.content". Repeat, Stat, or KeyValue bind structured hostKeys. Echo submitted fields from the form name ({targetKeyword}, inputs.targetKeyword). emptyText lives here. Offer a Back NavLink.',
    'Wait chrome is CAPABILITY (long-running, streaming, progress) — compose those modules; do not invent a second wait.',
  ].join('\n'),
  dashboard: [
    'ARCHETYPE RECIPE: dashboard',
    'Slots: Header → optional Filters → KPI / summary → primary visualization or module → supporting modules → optional detail / activity.',
    'Module count and types come from layoutPlan / outputSchema / brief nouns. Bind every metric and collection by statePath; do not hard-code values. Do not emit a fixed Grid of four Stat. A single Table with no other modules is collection, not dashboard.',
    'Set page onLoad to the fetch action. Filters and date-range belong in a Toolbar when those capabilities are set. No parameters form beside the modules unless the brief asked for one.',
  ].join('\n'),
  workflow: [
    'ARCHETYPE RECIPE: workflow',
    'Slots: Progress → current step (inputs + actions) → navigation.',
    'A task composed of sequential stages — not automatically one page per step. Two or three short stages can be one page of Sections (progressive disclosure) with a Stepper. Named review / launch stages can be separate pages. Early stages use Next; the last stage is the only SubmitButton. Back and Skip are CAPABILITY.',
    'Progress is a Stepper (items Label|path or Label|section), not Tabs and not ProgressSteps. Tabs are for non-sequential peer views.',
  ].join('\n'),
  content: [
    'ARCHETYPE RECIPE: content',
    'Slots: Header → metadata → main content → optional related content → actions.',
    'Main body is DataText markdown (statePath "content" or the prose hostKey). Metadata is muted Chips or KeyValue from named fields. Related is Repeat/Table only when layoutPlan has a sibling collection.',
    'Not results: do not put WorkingCard here unless a wait capability is also set. Not detail: do not build entity firmographics when the job is a document.',
  ].join('\n'),
  workspace: [
    'ARCHETYPE RECIPE: workspace',
    'One page. Root content is a Workspace with slots navigator, primary, inspector. Exactly one primary region. Navigator is usually a collection; inspector is contextual (detail, results, or content).',
    'Regions sync through selectedId / selectItem. Prefer split-view; do not use Tabs for the three regions. Inspector may use showWhen "selectedId". Region archetypes cannot be workspace.',
    'A single collection, form, analysis, document, or metrics page is not this recipe.',
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
 * Recipes for the app archetype plus every page and workspace-region shape so
 * a mixed sitemap is not generated as if every page were the entry shape.
 */
export function archetypeRecipesForBrief(brief: ArenaGenerativeStructuredBrief): string {
  const shapes = new Set<ArenaGenerativeArchetype>([brief.archetype])
  for (const page of brief.pages) {
    if (page.archetype) shapes.add(page.archetype)
    if (page.regions) {
      if (page.regions.navigator) shapes.add(page.regions.navigator.archetype)
      shapes.add(page.regions.primary.archetype)
      if (page.regions.inspector) shapes.add(page.regions.inspector.archetype)
    }
  }
  return ARENA_GENERATIVE_ARCHETYPES.filter((shape) => shapes.has(shape))
    .map((shape) => ARCHETYPE_RECIPES[shape])
    .join('\n\n')
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
 * Page shapes and workspace regions the spec LLM must honour in addition to the
 * app-level archetype recipe.
 */
export function formatPageShapesForGenerator(brief: ArenaGenerativeStructuredBrief): string {
  const lines = brief.pages.map((page) => {
    const shape = page.archetype ?? brief.archetype
    const regions = page.regions
      ? ` regions: navigator=${page.regions.navigator?.archetype ?? '—'} primary=${page.regions.primary.archetype} inspector=${page.regions.inspector?.archetype ?? '—'}`
      : ''
    return `- ${page.path}: ${shape}${regions}`
  })
  return ['Page shapes (emit each page using that recipe; do not treat every page as the app archetype):', ...lines].join(
    '\n'
  )
}

/**
 * Serialises the planned IA for the manifest-generation user payload.
 */
export function formatStructuredBriefForGenerator(brief: ArenaGenerativeStructuredBrief): string {
  return [
    'Structured brief (implement this information architecture; emit exactly these page paths as object keys):',
    JSON.stringify(brief, null, 2),
    formatPageShapesForGenerator(brief),
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
  const capabilities = plannedCapabilities([...selected])
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
      archetype: brief.archetype,
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
