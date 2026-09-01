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
import {
  ARENA_GENERATIVE_REPRESENTATIONS,
  type ArenaGenerativeRepresentation,
  parseArenaGenerativeRepresentation,
} from '@/lib/arena-generative-ui/representation'
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
  workspace: 'collection',
} as const

export const ARENA_GENERATIVE_SHELL_NAVIGATIONS = ['none', 'tabs', 'sidebar'] as const

export type ArenaGenerativeShellNavigation = (typeof ARENA_GENERATIVE_SHELL_NAVIGATIONS)[number]

export interface ArenaGenerativeShell {
  navigation: ArenaGenerativeShellNavigation
  header?: boolean
  breadcrumbs?: boolean
}

const MAX_PAGE_MODULES = 8

const ARCHETYPE_SET = new Set<string>(ARENA_GENERATIVE_ARCHETYPES)

/**
 * Maps a raw planner/stored archetype onto the closed enum. Compound product
 * names become the entry page shape.
 */
export function canonicalizeArchetype(value: unknown): ArenaGenerativeArchetype | undefined {
  if (typeof value !== 'string') return undefined
  if (ARCHETYPE_SET.has(value)) return value as ArenaGenerativeArchetype
  const aliased =
    ARENA_GENERATIVE_ARCHETYPE_ALIASES[value as keyof typeof ARENA_GENERATIVE_ARCHETYPE_ALIASES]
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

const representationSchema = z.enum(ARENA_GENERATIVE_REPRESENTATIONS)

const structuredBriefShellSchema = z.object({
  navigation: z.enum(ARENA_GENERATIVE_SHELL_NAVIGATIONS),
  header: z.boolean().optional(),
  breadcrumbs: z.boolean().optional(),
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
  /** Collection-body representation. Defaults to the app representation or auto. */
  representation: representationSchema.optional(),
  /** Domain sections on this page. Not peer archetypes. */
  modules: z.array(z.string().min(1).max(64)).max(MAX_PAGE_MODULES).optional(),
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
  /** Domain noun the collection or record is about (competitor, order). */
  entity: briefProse(80).optional(),
  /** App-default collection representation. Pages may override. */
  representation: representationSchema.optional(),
  /** Persistent chrome. Omitted means navigation none. */
  shell: structuredBriefShellSchema.optional(),
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

export type ArenaGenerativeHierarchyDominant = (typeof ARENA_GENERATIVE_HIERARCHY_DOMINANTS)[number]
export type ArenaGenerativeHierarchySupporting =
  (typeof ARENA_GENERATIVE_HIERARCHY_SUPPORTING)[number]
export type ArenaGenerativeNavigationPattern = (typeof ARENA_GENERATIVE_NAVIGATION_PATTERNS)[number]
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
  if (page.archetype === 'workspace') {
    const fromPrimary = primaryRegionArchetype(page.regions)
    return fromPrimary ?? 'collection'
  }
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

function primaryRegionArchetype(value: unknown): ArenaGenerativeArchetype | undefined {
  if (!isRecord(value) || !isRecord(value.primary)) return undefined
  return canonicalizeArchetype(value.primary.archetype)
}

function sanitizeModules(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const modules: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const next = item
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-{2,}/g, '-')
    if (!next || seen.has(next)) continue
    seen.add(next)
    modules.push(next)
    if (modules.length >= MAX_PAGE_MODULES) break
  }
  return modules.length > 0 ? modules : undefined
}

function modulesFromLegacyComposition(page: Record<string, unknown>): string[] | undefined {
  const declared = sanitizeModules(page.modules)
  if (declared) return declared
  if (isRecord(page.regions)) {
    const names: string[] = []
    if (isRecord(page.regions.navigator)) names.push('navigator')
    if (isRecord(page.regions.inspector)) names.push('inspector')
    if (names.length > 0) return names
  }
  if (isRecord(page.secondary) && typeof page.secondary.role === 'string') {
    const role = page.secondary.role.trim().toLowerCase()
    if (role === 'context' || role === 'detail' || role === 'results') return [role]
  }
  return undefined
}

function sanitizeShell(value: unknown): ArenaGenerativeShell | undefined {
  if (!isRecord(value)) return undefined
  const navigation = asClosedEnum(value.navigation, ARENA_GENERATIVE_SHELL_NAVIGATIONS)
  if (!navigation) return undefined
  const shell: ArenaGenerativeShell = { navigation }
  if (typeof value.header === 'boolean') shell.header = value.header
  if (typeof value.breadcrumbs === 'boolean') shell.breadcrumbs = value.breadcrumbs
  return shell
}

function liftShell(value: unknown, forceSidebar: boolean): ArenaGenerativeShell | undefined {
  const parsed = sanitizeShell(value)
  if (parsed) {
    if (forceSidebar && parsed.navigation === 'none') {
      return { ...parsed, navigation: 'sidebar' }
    }
    return parsed
  }
  return forceSidebar ? { navigation: 'sidebar' } : undefined
}

function liftRepresentation(value: unknown): ArenaGenerativeRepresentation | undefined {
  if (value == null || value === '') return undefined
  return parseArenaGenerativeRepresentation(value)
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
  const pagesAreWorkspace =
    Array.isArray(next.pages) &&
    next.pages.some((page) => isRecord(page) && page.archetype === 'workspace')
  const storedWorkspace = rawAppArchetype === 'workspace' || pagesAreWorkspace
  let appArchetype = canonicalizeArchetype(rawAppArchetype)
  if (rawAppArchetype === 'workspace') {
    const entryPath = typeof next.entryPath === 'string' ? next.entryPath : undefined
    const entryPage = Array.isArray(next.pages)
      ? (next.pages.find((page) => isRecord(page) && page.path === entryPath) ?? next.pages[0])
      : undefined
    const fromPrimary = isRecord(entryPage) ? primaryRegionArchetype(entryPage.regions) : undefined
    appArchetype = fromPrimary ?? 'collection'
  }
  if (appArchetype) next.archetype = appArchetype
  const shell = liftShell(next.shell, storedWorkspace)
  let liftedPlan = shell ? { ...next, shell } : omit(next, ['shell'])
  const appRepresentation = liftRepresentation(liftedPlan.representation)
  liftedPlan = appRepresentation
    ? { ...liftedPlan, representation: appRepresentation }
    : omit(liftedPlan, ['representation'])
  if (Array.isArray(liftedPlan.pages) && appArchetype) {
    liftedPlan = {
      ...liftedPlan,
      pages: liftedPlan.pages.map((page) => {
        if (!isRecord(page)) return page
        const pageArchetype = inferPageArchetype(page, rawAppArchetype, appArchetype)
        let lifted: Record<string, unknown> = { ...page, archetype: pageArchetype }
        const pageRepresentation = liftRepresentation(page.representation)
        lifted = pageRepresentation
          ? { ...lifted, representation: pageRepresentation }
          : omit(lifted, ['representation'])
        const modules = modulesFromLegacyComposition(page)
        lifted = modules ? { ...lifted, modules } : omit(lifted, ['modules'])
        return omit(lifted, ['regions', 'secondary'])
      }),
    }
  }
  return liftedPlan
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
  'Application architecture is SHELL + SITEMAP. Design System is host-owned — not a planner job. Each page is PRIMARY ARCHETYPE + 0–5 CAPABILITIES + MODULES. Extra jobs are extra sitemap pages — never detail + results + dashboard as peer jobs on one page.',
  'When Analyzed intent is present, honour its task, entities, actions, and complexity — do not rewrite the job. Pick the app archetype, per-page shapes, shell, modules, representation, capabilities, designIntent, informationHierarchy, and interactionModel that implement that intent.',
  'When intent is absent, read User request, declared bindings, Design notes, and any pinned pages together. Honour every name, label, CTA key, field, and navigation the user DID write. Infer only sitemap, archetype, page shapes, shell, modules, representation, capabilities, designIntent, informationHierarchy, and interactionModel.',
  'Archetype is the job of a page, not the visual layout and not the app chrome. Pick exactly one app-level archetype (the entry job). Each page also declares pages[].archetype. Mixed sitemaps are normal.',
  '- collection: How do I browse/manage many things?',
  '- detail: How do I understand one thing?',
  '- task: How do I provide information to accomplish something?',
  '- results: How do I consume/analyze generated output?',
  '- dashboard: How do I monitor many important signals?',
  '- workflow: How do I complete a multi-stage task?',
  '- content: How do I read/create/edit substantial content?',
  'Disambiguate from the job, not from how complete the brief is. Scan many modules on arrival → dashboard. Find/act on a list → collection. One entity → detail. Provide input to do a thing → task. Sequential stages → workflow. Output of generate/analyze → results. Read/edit a document as the product → content. Mixed briefs: pick the entry verb; extra destinations are extra pages with their own shape.',
  'Shell is app chrome, not a page job. Ask: does this product need persistent navigation / header / breadcrumbs? Emit optional shell { navigation: none | tabs | sidebar, header?, breadcrumbs? }. Default is omit or none — a typical one-job Arena app has no fake SaaS chrome. sidebar only when a list and a record (or inspector) must stay visible together. tabs only for three or more peer top-level views. workspace is not a page archetype; do not emit it.',
  'Modules are domain sections on that page (firmographics, marketing, competitors, ai-analysis, activity) — kebab or short nouns, at most eight. Bind them to brief nouns and layoutPlan hostKeys. Do not invent modules the schema cannot fill. Do not treat a module as a second page archetype.',
  'Representation is how a collection body is shown — not an archetype and not a capability. Emit representation (app default) and optional pages[].representation: auto | table | cards | list | kanban | timeline. auto lets BindingLayoutPlan decide. Do not emit kanban or timeline as capabilities. There is no Kanban, Timeline, or List catalog type.',
  'Optional entity is the domain noun (competitor, order). purpose stays one prose sentence.',
  'Set capabilities to at most five tags that apply: long-running, streaming, multi-step, cancellable, progress, search, filter, sort, pagination, grouping, date-range, refresh, drill-down, selection, detail, detail-drawer, analyze, drawer, modal, create, edit, delete, back, skip, review, chat. Combine them. A workflow binding is long-running; stream: true is streaming; binding.pagination is pagination; binding.chatProtocol.input is chat; a single prominent query is search; Toolbar narrowing is filter; a date window is date-range; opening one entity is detail (Drawer when the list must stay visible — also set detail-drawer); an analyze/generate CTA is analyze (destination is a results page, or a module named for the analysis). Destination pages stay pages[].archetype. Search and filter are still valid with no bindings — they filter the on-page collection locally; do not invent actionIds for them. Omit tags the job does not need. Do not emit "short", "editable", "export", "generate", "table", "chart", "kanban", "share", or "comments".',
  'Also emit designIntent { productType, density, visualTone, contentType, emphasis } — pick one of each. Honour Design Notes first. Else derive from archetype plus brief nouns: dashboard → analytics / compact / data-heavy / data; task or results → workflow / comfortable / task; collection → crm / comfortable / discovery; workflow → workflow / comfortable / task; content → content / comfortable / narrative / content; shell.sidebar → saas / comfortable / discovery. Override productType from domain words (invoices → finance, campaigns → marketing). density is compact | comfortable | roomy (spacious means roomy). visualTone is professional | friendly | premium | technical | editorial. contentType is data-heavy | workflow | narrative | transactional. emphasis is task | data | content | discovery. Classification only — not component props.',
  'Also emit informationHierarchy { dominant, supporting? } and interactionModel { navigation, selection, wait }. Honour Design Notes first. Else derive from page shapes: dashboard → metrics; collection → collection; task → form; results or content → prose; workflow → wizard-step; shell.sidebar → collection with supporting navigator/inspector. dominant is form | collection | metrics | prose | document | wizard-step. supporting is zero or more of filters, history, sidebar, detail, stats, navigator, inspector. navigation is search-hero | tabs | list-detail | wizard | workspace | single-page. selection is none | same-page | navigate. wait is none | working-card — working-card only when a wait capability is set. Classification only — not component props. interactionModel.navigation workspace does not set shell.',
  'Shape: { "title", "purpose", "audience", "archetype", "entity"?, "representation"?, "shell"?, "entryPath", "pages": [{ "path", "title", "purpose", "data", "actions", "emptyCopy"?, "archetype"?, "representation"?, "modules"? }], "actions": [{ "id", "apiKey", "fromPage", "purpose", "onSuccessNavigate" }], "capabilities"?: string[], "designIntent"?: { "productType", "density", "visualTone", "contentType", "emphasis" }, "informationHierarchy"?: { "dominant", "supporting"? }, "interactionModel"?: { "navigation", "selection", "wait" }, "emptyCopy"?, "errorCopy"? }',
  'title is the product name. purpose is the job in one sentence (copy intent.task when present). audience is a real role — never "users".',
  'pages[].path, entryPath, and actions[].fromPage are bare kebab-case keys — "home", "select-company" — never URL routes: no leading slash, no "/" for the entry page, no nested segments. Call the entry page "home" unless the brief names it.',
  '1–6 pages. Infer the smallest sitemap that completes the job: task that produces an answer has a results page plus Back; collection that opens a record has a detail page, or same-page Open / detail / detail-drawer when the row already carries prose; a second binding that is a list/history is a collection page with onLoad, not a second submit. A sidebar shell is usually one page with modules, not a second archetype. Do not invent login, settings, profile, marketing, or extra tools the job does not need.',
  'data is one sentence (onLoad which action into which state keys, or CTA then navigate, or static).',
  'A dashboard, collection, report, detail, or content page names onLoad in data when it fetches on arrival. A task form page does not. A results page that a CTA already navigates to must not onLoad that same action.',
  'Bindings are the data contract. Form fields come from each binding inputSchema (source form or omitted); source visitorEmail or constant are host-stamped — do not plan a visible field for them. The Start field named input is an optional constant prefix, not a form control. chatProtocol (input, conversationId, files) is Chat for follow-ups; the first form CTA composes input from that prefix plus name: value. Wire each CTA to the binding whose key the brief named, or the one whose inputs/outputs match the job when the brief only described it in words. actions[].apiKey must be a declared binding key. When no bindings were declared, actions must be [].',
  'When a binding has no outputSchema, do not plan Table or Stat columns; results are prose (DataText content) unless the brief names exact keys. When layoutPlan or outputSchema names a collection, plan Repeat/Table/Stat against those host keys, not invented ones.',
  'emptyCopy is the zero-result sentence for that page\'s collection (becomes emptyText) — name the collection in the domain, not generic "No results". errorCopy is the failure sentence for this job.',
  'Give an onLoad action no onSuccessNavigate.',
  'Plan sitemap, data, actions, and capabilities — not loading widgets. Do not mention ProgressBar, ProgressSteps, Skeleton, or an error Alert in pages[].purpose or data; the host compiles those.',
  ARENA_GENERATIVE_UI_PLANNER_DS_CONTEXT,
].join('\n')

const ARCHETYPE_RECIPES: Record<ArenaGenerativeArchetype, string> = {
  collection: [
    'ARCHETYPE RECIPE: collection',
    'Purpose: Display and operate on a collection of entities.',
    'Structure: Header → Toolbar → Collection → optional modules.',
    'Rules: Choose the collection representation from data shape and user task (see REPRESENTATION). Bind collection data when bindings exist; static Table rows are allowed when there are none. Search/filter belong in the Toolbar or Filter. When no search/filter API exists, omit actionId — the host filters visible rows locally. Name Filter Selects after columns. Entity actions stay on the entity. Use selection/bulk only when the task needs them. Opening a record is CAPABILITY detail (navigate, drawer, modal, or inline). Modules are domain sections, not a second page job. Loading, empty, and error are host — set emptyText.',
  ].join('\n'),
  detail: [
    'ARCHETYPE RECIPE: detail',
    'Purpose: Understand one entity.',
    'Structure: Header → primary facts → modules → related → actions.',
    'Rules: Modules come from the data model and layoutPlan, not a fixed template. Bind the record; never hard-code fields. Related collections use REPRESENTATION. When opened with ?id=, onLoad that record unless selectItem already copied it. Back to the collection. emptyText names the entity. Do not emit results or dashboard as peer archetypes on this page.',
  ].join('\n'),
  task: [
    'ARCHETYPE RECIPE: task',
    'Purpose: Collect input to accomplish something.',
    'Structure: Header → optional context → Form or SearchField → one primary action.',
    'Rules: A single prominent query is SearchField. Multi-field input is a Form. No onLoad on the form page. Results are optional — add a results page only when the CTA produces an answer (CAPABILITY analyze). Same-page saves stay here; the host toasts.',
  ].join('\n'),
  results: [
    'ARCHETYPE RECIPE: results',
    'Purpose: Consume or analyze generated output.',
    'Structure: Context → summary → primary result → supporting → actions.',
    'Rules: No onLoad of the CTA that already navigated here. Bind markdown on DataText "content" (or the string field name), never "field.content". Structured hostKeys use Repeat, Stat, or KeyValue. Echo form names ({targetKeyword}, inputs.targetKeyword). emptyText lives here. Wait chrome is CAPABILITY.',
  ].join('\n'),
  dashboard: [
    'ARCHETYPE RECIPE: dashboard',
    'Purpose: Monitor many important signals on arrival.',
    'Structure: Header → Filters → KPI/summary → primary module → supporting → activity.',
    'Rules: Module count and types follow layoutPlan / outputSchema — never a fixed widget set. Bind every metric and collection. A single collection with no other modules is collection, not dashboard. onLoad fetches the scan. Filters and date-range belong in the Toolbar.',
  ].join('\n'),
  workflow: [
    'ARCHETYPE RECIPE: workflow',
    'Purpose: Complete a multi-stage task.',
    'Structure: Progress → current step (inputs + actions) → navigation.',
    'Rules: Not automatically one page per step. Two or three short stages can be one page of Sections. Named review/launch can be pages. Progress is a Stepper, not Tabs. Early stages use Next; the last is the only SubmitButton. Back, skip, and review are CAPABILITY.',
  ].join('\n'),
  content: [
    'ARCHETYPE RECIPE: content',
    'Purpose: Read or lightly edit substantial content.',
    'Structure: Header → metadata → main body → optional related → actions.',
    'Rules: Main body is DataText markdown. Metadata stays muted. Related collections only when layoutPlan has one. Not results (no WorkingCard unless a wait capability is set). Not detail (no entity firmographics when the job is a document).',
  ].join('\n'),
}

/**
 * App chrome recipe. Not an eighth page job — appended when shell.navigation
 * is tabs or sidebar.
 */
export const SHELL_RECIPE = [
  'SHELL RECIPE',
  'App chrome is not a page job. Honour brief.shell.',
  'sidebar: emit catalog Workspace — navigator, primary, optional inspector. Sync via selectedId. Inspector may use showWhen "selectedId". No Tabs for these regions. Host collapses inspector, then navigator.',
  'tabs: emit Tabs as Label|path. Not sequential steps (those are Stepper).',
  'none: no app chrome column — do not emit Workspace or a fake SaaS sidebar.',
  'header / breadcrumbs: emit PageHeader and breadcrumb NavLinks only when those flags are true.',
].join('\n')

/** Prompt fragment for a non-none shell. Empty when chrome is omitted. */
export function shellRecipe(shell?: ArenaGenerativeShell): string {
  if (!shell || shell.navigation === 'none') return ''
  return SHELL_RECIPE
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
 * Recipes for the app archetype plus every page job (and shell chrome when
 * navigation is not none) so a mixed sitemap is not generated as if every
 * page were the entry shape.
 */
export function archetypeRecipesForBrief(brief: ArenaGenerativeStructuredBrief): string {
  const shapes = new Set<ArenaGenerativeArchetype>([brief.archetype])
  for (const page of brief.pages) {
    if (page.archetype) shapes.add(page.archetype)
  }
  const recipes = ARENA_GENERATIVE_ARCHETYPES.filter((shape) => shapes.has(shape)).map(
    (shape) => ARCHETYPE_RECIPES[shape]
  )
  const chrome = shellRecipe(brief.shell)
  if (chrome) recipes.push(chrome)
  return recipes.join('\n\n')
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
 * Page jobs, modules, and shell the spec LLM must honour in addition to the
 * app-level archetype recipe.
 */
export function formatPageShapesForGenerator(brief: ArenaGenerativeStructuredBrief): string {
  const appRepresentation = brief.representation ?? 'auto'
  const entity = brief.entity ? `Entity: ${brief.entity}` : ''
  const navigation = brief.shell?.navigation ?? 'none'
  const shellFlags = [
    brief.shell?.header ? 'header' : '',
    brief.shell?.breadcrumbs ? 'breadcrumbs' : '',
  ]
    .filter((flag) => flag.length > 0)
    .join(' ')
  const shell = `Shell: navigation=${navigation}${shellFlags ? ` ${shellFlags}` : ''}`
  const lines = brief.pages.map((page) => {
    const shape = page.archetype ?? brief.archetype
    const representation = page.representation ?? appRepresentation
    const modules = page.modules?.length ? ` modules: ${page.modules.join(', ')}` : ''
    return `- ${page.path}: ${shape} representation=${representation}${modules}`
  })
  return [
    'Page shapes (emit each page using that recipe; do not treat every page as the app archetype):',
    'Each page is one primary archetype + capabilities + modules. Do not emit detail + results + dashboard as peer jobs on one page.',
    shell,
    entity,
    ...lines,
  ]
    .filter((line) => line.length > 0)
    .join('\n')
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
  'That was not a valid structured brief. Return one JSON object in the planner shape (title, purpose, audience, archetype, shell?, entryPath, pages[] with modules?, actions[], capabilities?, designIntent?, informationHierarchy?, interactionModel?). Do not emit a manifest.'

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
