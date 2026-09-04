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
import { PLANNER_CONTRACT_PROMPT } from '@/lib/arena-generative-ui/planner-contract'
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
  ARENA_GENERATIVE_UI_REPRESENTATION_PROMPT,
  parseArenaGenerativeRepresentation,
} from '@/lib/arena-generative-ui/representation'
import { ARENA_GENERATIVE_UI_TOOL_TIMEOUT_MS } from '@/lib/arena-generative-ui/timeout'
import {
  ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN,
  type ArenaGenerativeApiBinding,
  type ArenaGenerativePageHint,
} from '@/lib/arena-generative-ui/types'
import {
  formatVisualBriefForPlanner,
  MATCH_SCREENSHOT_USER_INPUT,
  type ArenaGenerativeVisualBrief,
} from '@/lib/arena-generative-ui/visual-brief'
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
  'workspace',
] as const

export type ArenaGenerativeArchetype = (typeof ARENA_GENERATIVE_ARCHETYPES)[number]

/** Stored / planner aliases so old drafts still parse. */
export const ARENA_GENERATIVE_ARCHETYPE_ALIASES = {
  'list-detail': 'collection',
  'form-result': 'task',
  wizard: 'workflow',
} as const

export const ARENA_GENERATIVE_COMPLEXITIES = ['micro', 'simple', 'moderate', 'complex'] as const

export type ArenaGenerativeComplexity = (typeof ARENA_GENERATIVE_COMPLEXITIES)[number]

export const ARENA_GENERATIVE_DATA_MODES = [
  'dummy',
  'local',
  'remote',
  'generated',
  'hybrid',
] as const

export type ArenaGenerativeDataMode = (typeof ARENA_GENERATIVE_DATA_MODES)[number]

export const ARENA_GENERATIVE_SHELL_NAVIGATIONS = [
  'minimal',
  'none',
  'tabs',
  'sidebar',
  'workspace',
] as const

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

const pageRegionSchema = z.object({
  archetype: pageShapeSchema,
  entity: briefProse(80).optional(),
  representation: representationSchema.optional(),
  purpose: briefProse(400).optional(),
})

const PAGE_REGION_KEYS = ['navigator', 'primary', 'inspector', 'auxiliary'] as const

type PageRegionKey = (typeof PAGE_REGION_KEYS)[number]

const pageRegionsSchema = z.object({
  navigator: pageRegionSchema.optional(),
  primary: pageRegionSchema.optional(),
  inspector: pageRegionSchema.optional(),
  auxiliary: pageRegionSchema.optional(),
})

const PAGE_INTERACTION_KEYS = [
  'selection',
  'inspect',
  'execution',
  'completion',
  'editing',
] as const

export type ArenaGenerativePageInteraction = {
  [Key in (typeof PAGE_INTERACTION_KEYS)[number]]?: string
}

const PAGE_INTERACTION_VALUE_MAX = 64
const PAGE_INTERACTION_KEY_PATTERN = '(selection|inspect|detail|execution|completion|editing)'

const pageInteractionSchema = z.object({
  selection: z.string().min(1).max(PAGE_INTERACTION_VALUE_MAX).optional(),
  inspect: z.string().min(1).max(PAGE_INTERACTION_VALUE_MAX).optional(),
  execution: z.string().min(1).max(PAGE_INTERACTION_VALUE_MAX).optional(),
  completion: z.string().min(1).max(PAGE_INTERACTION_VALUE_MAX).optional(),
  editing: z.string().min(1).max(PAGE_INTERACTION_VALUE_MAX).optional(),
})

function canonicalizePageInteractionKey(raw: string): keyof ArenaGenerativePageInteraction | undefined {
  switch (raw.trim().toLowerCase().replace(/_/g, '-')) {
    case 'selection':
      return 'selection'
    case 'inspect':
    case 'detail':
      return 'inspect'
    case 'execution':
      return 'execution'
    case 'completion':
      return 'completion'
    case 'editing':
      return 'editing'
    default:
      return undefined
  }
}

function clampPageInteractionValue(value: string): string | undefined {
  const trimmed = value.trim().replace(/^[;,\s]+|[;,\s]+$/g, '')
  if (!trimmed) return undefined
  return truncate(trimmed, PAGE_INTERACTION_VALUE_MAX, '')
}

function collectPageInteractionMatches(
  value: string,
  pattern: RegExp
): ArenaGenerativePageInteraction | undefined {
  const result: ArenaGenerativePageInteraction = {}
  for (const match of value.matchAll(pattern)) {
    const key = canonicalizePageInteractionKey(match[1] ?? '')
    const parsed = clampPageInteractionValue(match[2] ?? '')
    if (key && parsed && result[key] == null) result[key] = parsed
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * Planner contract examples are strings (`selection: single`) or compact
 * phrases (`selection single, detail simultaneous`). Map those onto the
 * object the generator reads instead of dropping the field.
 */
export function parsePageInteraction(value: unknown): ArenaGenerativePageInteraction | undefined {
  if (typeof value === 'string') {
    const labeled = collectPageInteractionMatches(
      value,
      new RegExp(
        `${PAGE_INTERACTION_KEY_PATTERN}\\s*[:=]\\s*([\\s\\S]*?)(?=\\s*(?:[;,]\\s*)?${PAGE_INTERACTION_KEY_PATTERN}\\s*[:=]|$)`,
        'gi'
      )
    )
    if (labeled) return labeled
    const compact = collectPageInteractionMatches(
      value,
      new RegExp(`${PAGE_INTERACTION_KEY_PATTERN}\\s+([^,;\\n]+)`, 'gi')
    )
    if (compact) return compact
    const fallback = clampPageInteractionValue(value)
    return fallback ? { selection: fallback } : undefined
  }
  if (!isRecord(value)) return undefined
  const result: ArenaGenerativePageInteraction = {}
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = canonicalizePageInteractionKey(rawKey)
    if (!key || typeof rawValue !== 'string') continue
    const parsed = clampPageInteractionValue(rawValue)
    if (parsed && result[key] == null) result[key] = parsed
  }
  return Object.keys(result).length > 0 ? result : undefined
}

const structuredBriefPageSchema = z.object({
  path: pagePathSchema,
  title: briefProse(80),
  purpose: briefProse(400),
  /** How the page gets its data: onLoad, CTA navigation, static, or dummy. */
  data: briefProse(400),
  dataMode: z.enum(ARENA_GENERATIVE_DATA_MODES).optional(),
  actions: z
    .array(z.string().min(1).max(64))
    .default([])
    .transform((values) => values.slice(0, 16)),
  emptyCopy: briefProse(200).optional(),
  /** Structural shape of this page. Defaults to the app archetype. */
  archetype: pageShapeSchema.optional(),
  entity: briefProse(80).optional(),
  /** Collection-body representation. Defaults to the app representation or auto. */
  representation: representationSchema.optional(),
  capabilities: z
    .array(z.string())
    .max(12)
    .default([])
    .transform((values) => plannedCapabilities(values)),
  interaction: z
    .union([pageInteractionSchema, z.string().transform((value) => parsePageInteraction(value))])
    .optional()
    .transform((value) => (value && Object.keys(value).length > 0 ? value : undefined)),
  regions: pageRegionsSchema.optional(),
  /** Domain sections on this page. Not peer archetypes. */
  modules: z.array(z.string().min(1).max(64)).max(MAX_PAGE_MODULES).optional(),
})

const structuredBriefActionSchema = z.object({
  id: z.string().min(1).max(64),
  purpose: briefProse(400),
  source: z.string().min(1).max(80).optional(),
  target: z.string().max(80).optional(),
  apiKey: z.string().min(1).max(64).optional(),
  fromPage: pagePathSchema.optional(),
  onSuccessNavigate: z.string().max(80).nullable().optional(),
})

const structuredBriefEntitySchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(64),
  relationships: z.array(z.string().min(1).max(64)).max(8).optional(),
})

const structuredBriefSchema = z.object({
  title: briefProse(80),
  purpose: briefProse(400),
  audience: briefProse(200),
  complexity: z.enum(ARENA_GENERATIVE_COMPLEXITIES).optional(),
  archetype: pageShapeSchema,
  /** Domain noun the collection or record is about (competitor, order). */
  entity: briefProse(80).optional(),
  /** App-default collection representation. Pages may override. */
  representation: representationSchema.optional(),
  /** Persistent chrome. Omitted or minimal means no product chrome. */
  shell: structuredBriefShellSchema.optional(),
  entryPath: pagePathSchema,
  entities: z.array(structuredBriefEntitySchema).max(12).optional(),
  pages: z.array(structuredBriefPageSchema).min(1).max(8),
  actions: z
    .array(structuredBriefActionSchema)
    .default([])
    .transform((values) => values.slice(0, 16)),
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
  design: z.unknown().optional(),
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
    if (forceSidebar && (parsed.navigation === 'none' || parsed.navigation === 'minimal')) {
      return { ...parsed, navigation: 'sidebar' }
    }
    return parsed
  }
  return forceSidebar ? { navigation: 'sidebar' } : undefined
}

function liftDataMode(value: unknown): ArenaGenerativeDataMode | undefined {
  return asClosedEnum(value, ARENA_GENERATIVE_DATA_MODES)
}

function liftPageData(page: Record<string, unknown>): {
  data: unknown
  dataMode?: ArenaGenerativeDataMode
} {
  const declaredMode = liftDataMode(page.dataMode)
  if (isRecord(page.data) && typeof page.data.mode === 'string') {
    const mode = liftDataMode(page.data.mode)
    const description =
      typeof page.data.description === 'string' && page.data.description.trim()
        ? page.data.description
        : mode
    return { data: description ?? 'static', dataMode: mode ?? declaredMode }
  }
  if (typeof page.data === 'string') {
    const lowered = page.data.toLowerCase()
    const inferred =
      declaredMode ??
      (/\bdummy\b|\bmock\b|\bsample\b/.test(lowered)
        ? 'dummy'
        : /\bonload\b|\bfetch\b/.test(lowered)
          ? 'remote'
          : undefined)
    return { data: page.data, dataMode: inferred }
  }
  return { data: page.data ?? 'static', dataMode: declaredMode }
}

function liftActionSource(action: Record<string, unknown>): Record<string, unknown> {
  const source = typeof action.source === 'string' ? action.source.trim() : ''
  if (source.startsWith('binding:')) {
    const key = source.slice('binding:'.length).trim()
    return {
      ...action,
      source,
      ...(key && !action.apiKey ? { apiKey: key } : {}),
    }
  }
  return action
}

function canonicalizeRegionKey(raw: unknown): PageRegionKey | undefined {
  if (typeof raw !== 'string') return undefined
  const key = raw.trim().toLowerCase().replace(/_/g, '-')
  return PAGE_REGION_KEYS.find((item) => item === key)
}

function regionKeyFromLegacyItem(item: Record<string, unknown>): PageRegionKey | undefined {
  return (
    canonicalizeRegionKey(item.role) ??
    canonicalizeRegionKey(item.region) ??
    canonicalizeRegionKey(item.id)
  )
}

function sanitizeOneRegion(region: unknown): Record<string, unknown> | undefined {
  if (!isRecord(region)) return undefined
  const archetype = canonicalizeArchetype(region.archetype)
  if (!archetype || archetype === 'workspace') return undefined
  const next: Record<string, unknown> = { archetype }
  if (typeof region.entity === 'string' && region.entity.trim()) next.entity = region.entity
  const representation = liftRepresentation(region.representation)
  if (representation) next.representation = representation
  if (typeof region.purpose === 'string' && region.purpose.trim()) next.purpose = region.purpose
  return next
}

/**
 * Named object is the contract. An array with role / region / id is the old
 * Composition Semantics shape — lift it so the workspace is not dropped.
 */
function sanitizeRegions(value: unknown): Record<string, unknown> | undefined {
  const regions: Record<string, unknown> = {}
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) continue
      const key = regionKeyFromLegacyItem(item)
      if (!key || regions[key]) continue
      const next = sanitizeOneRegion(item)
      if (next) regions[key] = next
    }
    return Object.keys(regions).length > 0 ? regions : undefined
  }
  if (!isRecord(value)) return undefined
  for (const key of PAGE_REGION_KEYS) {
    const next = sanitizeOneRegion(value[key])
    if (next) regions[key] = next
  }
  return Object.keys(regions).length > 0 ? regions : undefined
}

function liftRepresentation(value: unknown): ArenaGenerativeRepresentation | undefined {
  if (value == null || value === '') return undefined
  return parseArenaGenerativeRepresentation(value)
}

function liftSnakeCasePlanFields(value: unknown): unknown {
  if (!isRecord(value)) return value
  const next: Record<string, unknown> = { ...value }
  if (isRecord(next.app)) {
    if (next.title == null && next.app.title != null) next.title = next.app.title
    if (next.complexity == null && next.app.complexity != null) {
      next.complexity = next.app.complexity
    }
    if (next.shell == null && next.app.shell != null) next.shell = next.app.shell
    if (next.archetype == null && next.app.archetype != null) next.archetype = next.app.archetype
    if (next.pages == null && next.app.pages != null) next.pages = next.app.pages
    if (next.entities == null && next.app.entities != null) next.entities = next.app.entities
  }
  if (isRecord(next.pages) && !Array.isArray(next.pages)) {
    next.pages = Object.entries(next.pages).map(([path, page]) =>
      isRecord(page) ? { path: typeof page.path === 'string' ? page.path : path, ...page } : page
    )
  }
  if (next.designIntent == null && next.design != null) {
    next.designIntent = next.design
  }
  if (next.informationHierarchy == null && next.information_hierarchy != null) {
    next.informationHierarchy = next.information_hierarchy
  }
  if (next.interactionModel == null && next.interaction_model != null) {
    next.interactionModel = next.interaction_model
  }
  const rawAppArchetype = next.archetype
  let appArchetype = canonicalizeArchetype(rawAppArchetype)
  if (appArchetype) next.archetype = appArchetype
  const shell = liftShell(next.shell, false)
  let liftedPlan = shell ? { ...next, shell } : omit(next, ['shell'])
  const appRepresentation = liftRepresentation(liftedPlan.representation)
  liftedPlan = appRepresentation
    ? { ...liftedPlan, representation: appRepresentation }
    : omit(liftedPlan, ['representation'])
  if (Array.isArray(liftedPlan.actions)) {
    liftedPlan = {
      ...liftedPlan,
      actions: liftedPlan.actions.map((action) =>
        isRecord(action) ? liftActionSource(action) : action
      ),
    }
  }
  if (Array.isArray(liftedPlan.pages)) {
    liftedPlan = {
      ...liftedPlan,
      pages: liftedPlan.pages.map((page) => {
        if (!isRecord(page)) return page
        const pageArchetype = appArchetype
          ? inferPageArchetype(page, rawAppArchetype, appArchetype)
          : canonicalizeArchetype(page.archetype)
        const { data, dataMode } = liftPageData(page)
        let lifted: Record<string, unknown> = { ...page, data }
        if (pageArchetype) lifted.archetype = pageArchetype
        else lifted = omit(lifted, ['archetype'])
        if (dataMode) lifted.dataMode = dataMode
        const interaction = parsePageInteraction(page.interaction)
        lifted = interaction ? { ...lifted, interaction } : omit(lifted, ['interaction'])
        const pageRepresentation = liftRepresentation(page.representation)
        lifted = pageRepresentation
          ? { ...lifted, representation: pageRepresentation }
          : omit(lifted, ['representation'])
        const regions = sanitizeRegions(page.regions)
        lifted = regions ? { ...lifted, regions } : omit(lifted, ['regions', 'secondary'])
        const modules = regions
          ? sanitizeModules(page.modules)
          : modulesFromLegacyComposition(page)
        lifted = modules ? { ...lifted, modules } : omit(lifted, ['modules'])
        return omit(lifted, ['secondary'])
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
  'designIntent' | 'informationHierarchy' | 'interactionModel' | 'design'
> & {
  designIntent?: ArenaGenerativeDesignIntent
  informationHierarchy?: ArenaGenerativeInformationHierarchy
  interactionModel?: ArenaGenerativeInteractionModel
}

function withParsedPlanClassifiers(
  brief: z.output<typeof structuredBriefSchema>
): ArenaGenerativeStructuredBrief {
  const designIntent = parseArenaGenerativeDesignIntent(brief.designIntent ?? brief.design)
  const informationHierarchy = parseArenaGenerativeInformationHierarchy(brief.informationHierarchy)
  const interactionModel = parseArenaGenerativeInteractionModel(brief.interactionModel)
  const pageCapabilities = brief.pages.flatMap((page) => page.capabilities)
  const capabilities = plannedCapabilities([...brief.capabilities, ...pageCapabilities])
  return {
    ...omit(brief, ['designIntent', 'informationHierarchy', 'interactionModel', 'design']),
    capabilities,
    ...(designIntent ? { designIntent } : {}),
    ...(informationHierarchy ? { informationHierarchy } : {}),
    ...(interactionModel ? { interactionModel } : {}),
  }
}

const PLANNER_SYSTEM_PROMPT = PLANNER_CONTRACT_PROMPT

const ARCHETYPE_RECIPES: Record<ArenaGenerativeArchetype, string> = {
  collection: [
    'ARCHETYPE RECIPE: collection',
    'Purpose: Display and operate on a collection of entities.',
    'Structure: Header → Toolbar (only if CAPABILITY search/filter/sort is selected) → Collection.',
    'Rules: Honour pages[].representation (list / table / cards). Bind collection data when bindings exist; dummy/local mode seeds 4–8 static Table rows or Repeat items. Do not add search, filter, stats, or a detail page unless the blueprint listed them. Entity actions stay on the entity. Inspect is CAPABILITY inspect: same-page when pages[].regions.inspector or interaction.inspect is not navigate; a Detail page only when the sitemap already has one. Loading, empty, and error are host — set emptyText.',
  ].join('\n'),
  detail: [
    'ARCHETYPE RECIPE: detail',
    'Purpose: Understand one entity.',
    'Structure: Header → primary facts → related → actions.',
    'Rules: Bind the record; never hard-code fields unless data.mode is dummy. When opened with ?id=, onLoad that record unless selectItem already copied it. Back to the collection. emptyText names the entity. Do not emit results or dashboard as peer jobs on this page.',
  ].join('\n'),
  task: [
    'ARCHETYPE RECIPE: task',
    'Purpose: Collect input to accomplish something.',
    'Structure: Header → optional context → Form or SearchField → one primary action.',
    'Rules: A single prominent query is SearchField. Multi-field input is a Form. No onLoad on the form page. Do not add a results or history page unless the blueprint listed it. Same-page saves stay here; the host toasts.',
  ].join('\n'),
  results: [
    'ARCHETYPE RECIPE: results',
    'Purpose: Consume or analyze generated output.',
    'Structure: Context → primary result → actions.',
    'Rules: No onLoad of the CTA that already navigated here. Bind markdown on DataText "content" (or the string field name). Structured hostKeys use Repeat, Stat, or KeyValue only when the blueprint or layoutPlan named them. Do not invent SWOT, metrics, or extra modules. emptyText lives here. Wait chrome is CAPABILITY.',
  ].join('\n'),
  dashboard: [
    'ARCHETYPE RECIPE: dashboard',
    'Purpose: Monitor many important signals on arrival.',
    'Structure: Header → Filters (only if selected) → KPI/summary → primary module → supporting.',
    'Rules: Module count and types follow the blueprint and layoutPlan — never a fixed widget set. Bind every metric and collection. Primary visualization may be Chart when the bound collection is a numeric series; Sparkline only for compact under-Stat trends. A single collection with no other modules is collection, not dashboard.',
  ].join('\n'),
  workflow: [
    'ARCHETYPE RECIPE: workflow',
    'Purpose: Complete a multi-stage task.',
    'Structure: Progress → current step (inputs + actions) → navigation.',
    'Rules: Not automatically one page per step. Two or three short stages can be one page of Sections. Progress is a Stepper, not Tabs. Early stages use Next; the last is the only SubmitButton.',
  ].join('\n'),
  content: [
    'ARCHETYPE RECIPE: content',
    'Purpose: Read or lightly edit substantial content.',
    'Structure: Header → metadata → main body → optional related → actions.',
    'Rules: Main body is DataText markdown. Metadata stays muted. Related collections only when layoutPlan has one.',
  ].join('\n'),
  workspace: [
    'ARCHETYPE RECIPE: workspace',
    'Purpose: Keep coordinated regions visible together.',
    'Structure: catalog Workspace — navigator, primary, optional inspector / auxiliary.',
    'Rules: Honour pages[].regions and pages[].interaction (selection, inspect, execution). Each region independently uses that region\'s archetype recipe (collection, detail, …). selection: selectItem / selectedId updates the named region (filters another collection or drives inspector). Child collection rows include a foreign key (projectId) matching the selected row id; the host filters that Repeat/Table locally. inspect: inspector (showWhen "selectedId") — do not navigate to a Detail page. execution: WorkingCard / results stay in the named region — do not invent a Results page. Sync via selectedId. Do not invent a new region archetype or coordination the blueprint omitted. Do not emit a second page for a region the blueprint placed here.',
  ].join('\n'),
}

export const WORKSPACE_RECIPE = ARCHETYPE_RECIPES.workspace

/**
 * App chrome recipe. Not an eighth page job — appended when shell.navigation
 * is tabs or sidebar.
 */
export const SHELL_RECIPE = [
  'SHELL RECIPE',
  'App chrome is not a page job. Honour brief.shell.',
  'sidebar: emit catalog Workspace or a persistent nav column for top-level destinations. Sync via selectedId when regions exist. No Tabs for workspace regions. Host collapses inspector, then navigator.',
  'workspace: persistent multi-region chrome. Honour pages[].regions and pages[].interaction. Same catalog Workspace as the workspace page recipe.',
  'tabs: emit Tabs as Label|path. Not sequential steps (those are Stepper).',
  'minimal / none: no app chrome column — do not emit Workspace or a fake SaaS sidebar.',
  'header: emit AppHeader (icon + product name) as a direct child of Page. breadcrumbs: NavLinks only when that flag is true. PageHeader remains the in-page title inside Section.',
].join('\n')

const MINIMAL_SHELL = new Set<ArenaGenerativeShellNavigation>(['minimal', 'none'])

/** Prompt fragment for a non-minimal shell. Empty when chrome is omitted. */
export function shellRecipe(shell?: ArenaGenerativeShell): string {
  if (!shell || MINIMAL_SHELL.has(shell.navigation)) return ''
  return SHELL_RECIPE
}

export const ARENA_GENERATIVE_UI_DUMMY_DATA_PROMPT = [
  'DUMMY / LOCAL DATA',
  'When a page data.mode is dummy or local, seed 4–8 realistic static collection rows. Prefer Repeat/Table statePath plus onLoad setState so both parent and child arrays land in host state. When Workspace selection filters another collection, give each parent row an id and each child row a foreign key (projectId) matching that id. If you emit Table.rows instead, include Id and Project Id columns — the host filters those rows the same way. CTAs the blueprint named (create, complete, analyze, …) stay in manifest.actions with no apiKey (or source dummy/local). Use onSuccess.setState to append, toggle done, or seed report prose, and onSuccess.navigate when the blueprint named a destination. Do not invent API keys. Do not drop manifest.actions.',
].join('\n')

export interface PlanStructuredBriefParams {
  userInput: string
  pages?: ArenaGenerativePageHint[]
  entryPath?: string
  apiBindings: ArenaGenerativeApiBinding[]
  designNotes?: string
  /** Output of the intent analyzer. Absent when analysis failed open. */
  intent?: ArenaGenerativeIntent | null
  /** Screenshot interpretation. Visible structure and copy are explicit. */
  visualBrief?: ArenaGenerativeVisualBrief | null
}

/**
 * Recipe appended to the manifest-generation system prompt once a structured
 * brief has picked an archetype, so the few-shot is not always the dashboard.
 */
export function archetypeRecipe(archetype: ArenaGenerativeArchetype): string {
  return ARCHETYPE_RECIPES[archetype]
}

/**
 * Recipes for every page job, region job, shell, capability, and representation
 * the blueprint actually uses. Unused archetypes stay out of the spec prompt.
 */
export function recipesForBlueprint(brief: ArenaGenerativeStructuredBrief): string {
  const shapes = new Set<ArenaGenerativeArchetype>([brief.archetype])
  const representations = new Set<ArenaGenerativeRepresentation>()
  if (brief.representation) representations.add(brief.representation)
  for (const page of brief.pages ?? []) {
    if (page.archetype) shapes.add(page.archetype)
    if (page.representation) representations.add(page.representation)
    if (page.regions) {
      shapes.add('workspace')
      for (const region of Object.values(page.regions)) {
        if (region?.archetype) shapes.add(region.archetype)
        if (region?.representation) representations.add(region.representation)
      }
    }
  }
  const recipes = ARENA_GENERATIVE_ARCHETYPES.filter((shape) => shapes.has(shape)).map(
    (shape) => ARCHETYPE_RECIPES[shape]
  )
  const chrome = shellRecipe(brief.shell)
  if (chrome) recipes.push(chrome)
  const usedBodies = [...representations].some(
    (value) => value === 'list' || value === 'table' || value === 'cards'
  )
  if (usedBodies) recipes.push(ARENA_GENERATIVE_UI_REPRESENTATION_PROMPT)
  const dummy = (brief.pages ?? []).some(
    (page) => page.dataMode === 'dummy' || page.dataMode === 'local' || /\bdummy\b/i.test(page.data)
  )
  if (dummy) recipes.push(ARENA_GENERATIVE_UI_DUMMY_DATA_PROMPT)
  return recipes.filter((section) => section.length > 0).join('\n\n')
}

/**
 * Recipes for the app archetype plus every page job (and shell chrome when
 * navigation is not none) so a mixed sitemap is not generated as if every
 * page were the entry shape.
 */
export function archetypeRecipesForBrief(brief: ArenaGenerativeStructuredBrief): string {
  return recipesForBlueprint(brief)
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
  const navigation = brief.shell?.navigation ?? 'minimal'
  const shellFlags = [
    brief.shell?.header ? 'header' : '',
    brief.shell?.breadcrumbs ? 'breadcrumbs' : '',
  ]
    .filter((flag) => flag.length > 0)
    .join(' ')
  const shell = `Shell: navigation=${navigation}${shellFlags ? ` ${shellFlags}` : ''}`
  const complexity = brief.complexity ? `Complexity: ${brief.complexity}` : ''
  const lines = brief.pages.map((page) => {
    const shape = page.archetype ?? brief.archetype
    const representation = page.representation ?? appRepresentation
    const modules = page.modules?.length ? ` modules: ${page.modules.join(', ')}` : ''
    const capabilities = page.capabilities.length
      ? ` capabilities: ${page.capabilities.join(', ')}`
      : ''
    const dataMode = page.dataMode ? ` data.mode: ${page.dataMode}` : ''
    const regions = page.regions
      ? ` regions: ${Object.entries(page.regions)
          .filter(([, region]) => region)
          .map(([name, region]) => `${name}=${region?.archetype}`)
          .join(', ')}`
      : ''
    const interaction = page.interaction
      ? ` interaction: ${PAGE_INTERACTION_KEYS.filter((key) => page.interaction?.[key])
          .map((key) => `${key}=${page.interaction?.[key]}`)
          .join(', ')}`
      : ''
    return `- ${page.path}: ${shape} representation=${representation}${dataMode}${capabilities}${regions}${modules}${interaction}`
  })
  return [
    'Page shapes (emit each page using that recipe; do not treat every page as the app archetype):',
    'Each page is one primary archetype + capabilities + optional regions. Honour pages[].interaction when present. Do not emit detail + results + dashboard as peer jobs on one page. Do not add pages, history, stats, or modules the blueprint omitted.',
    complexity,
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
    "Honour this sitemap and capabilities. Do not add pages, history, stats, or modules the blueprint omitted. Honour onLoad vs CTA as each page's data field describes. Dummy/local data.mode seeds static rows and local actions — do not drop manifest.actions. Use that page's emptyCopy as emptyText on its collection.",
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
function isLocalBriefAction(action: {
  apiKey?: string
  source?: string
}): boolean {
  const source = action.source?.trim() ?? ''
  if (source === 'dummy' || source === 'local') return true
  if (source.startsWith('binding:')) return false
  return !action.apiKey
}

/**
 * True when any page is dummy/local data so the generator must keep local actions.
 */
export function briefHasDummyOrLocalData(brief: ArenaGenerativeStructuredBrief): boolean {
  return (brief.pages ?? []).some(
    (page) => page.dataMode === 'dummy' || page.dataMode === 'local' || /\bdummy\b/i.test(page.data)
  )
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
    .replace(/:[^/]+/g, 'detail')
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

export interface DroppedBriefAction {
  id: string
  apiKey?: string
}

export interface ParsedStructuredBrief {
  brief: ArenaGenerativeStructuredBrief
  droppedActions: DroppedBriefAction[]
}

function partitionBriefActions(
  actions: ArenaGenerativeStructuredBrief['actions'],
  bindingKeys: Set<string>
): {
  kept: ArenaGenerativeStructuredBrief['actions']
  dropped: DroppedBriefAction[]
} {
  const kept: ArenaGenerativeStructuredBrief['actions'] = []
  const dropped: DroppedBriefAction[] = []
  for (const action of actions) {
    if (isLocalBriefAction(action) || Boolean(action.apiKey && bindingKeys.has(action.apiKey))) {
      kept.push(action)
      continue
    }
    dropped.push({
      id: action.id,
      ...(action.apiKey ? { apiKey: action.apiKey } : {}),
    })
  }
  return { kept, dropped }
}

function formatDroppedActionNames(dropped: readonly DroppedBriefAction[]): string {
  return dropped
    .map((action) => (action.apiKey ? `${action.id} (apiKey "${action.apiKey}")` : action.id))
    .join(', ')
}

function droppedActionsRepairMessage(
  dropped: readonly DroppedBriefAction[],
  bindingKeys: readonly string[]
): string {
  const names = formatDroppedActionNames(dropped)
  const remap = bindingKeys.length
    ? `Declared binding keys: ${bindingKeys.join(', ')}. Remap those actions to a declared key or source dummy/local.`
    : 'No API bindings were declared. Give those actions source dummy or local. Do not invent API keys.'
  return `That brief invented action(s) ${names}. ${remap} Return one JSON object in the planner blueprint shape.`
}

function namedRegionCount(page: {
  regions?: ArenaGenerativeStructuredBrief['pages'][number]['regions']
}): number {
  if (!page.regions) return 0
  return PAGE_REGION_KEYS.filter((key) => page.regions?.[key]).length
}

/**
 * Workspace pages that declared regions but no `pages[].interaction`.
 * Two or more regions, or a workspace archetype with any region, must name
 * selection / inspect / execution.
 */
export function uncoordinatedWorkspacePages(brief: ArenaGenerativeStructuredBrief): string[] {
  return brief.pages
    .filter((page) => {
      const regions = namedRegionCount(page)
      if (regions === 0) return false
      if (regions < 2 && page.archetype !== 'workspace') return false
      return !page.interaction || Object.keys(page.interaction).length === 0
    })
    .map((page) => page.path)
}

function uncoordinatedRegionsRepairMessage(pages: readonly string[]): string {
  return `That brief composed page(s) ${pages.join(', ')} without pages[].interaction. Name selection, inspect, or execution so the regions coordinate. Return one JSON object in the planner blueprint shape. Do not emit a manifest.`
}

function plannerIssueRepairMessage(
  dropped: readonly DroppedBriefAction[],
  uncoordinatedPages: readonly string[],
  bindingKeys: readonly string[]
): string {
  if (dropped.length > 0 && uncoordinatedPages.length > 0) {
    return `${droppedActionsRepairMessage(dropped, bindingKeys)} ${uncoordinatedRegionsRepairMessage(uncoordinatedPages)}`
  }
  if (dropped.length > 0) return droppedActionsRepairMessage(dropped, bindingKeys)
  return uncoordinatedRegionsRepairMessage(uncoordinatedPages)
}

function parseStructuredBriefResult(
  value: unknown,
  options: {
    pageHints?: ArenaGenerativePageHint[]
    entryPath?: string
    apiBindings: ArenaGenerativeApiBinding[]
  }
): ParsedStructuredBrief | null {
  const parsed = structuredBriefSchema.safeParse(normalizeBriefPaths(value))
  if (!parsed.success) {
    logger.warn('Arena Generative UI structured brief failed schema validation', {
      issues: parsed.error.issues.slice(0, 8).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
    return null
  }
  let brief = parsed.data
  const bindingKeys = new Set(options.apiBindings.map((binding) => binding.key).filter(Boolean))
  const { kept, dropped } = partitionBriefActions(brief.actions, bindingKeys)
  if (dropped.length > 0) {
    brief = { ...brief, actions: kept }
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
  return {
    brief: foldProcessingIntoCapabilities(omit(withParsedPlanClassifiers(brief), ['intent'])),
    droppedActions: dropped,
  }
}

/**
 * Validates a model JSON object as a structured brief. Path-shaped fields are
 * normalised to bare kebab-case keys first. Extra keys are stripped. Invented
 * remote apiKeys are dropped; callers that need the list should parse via the
 * planner, which retries once before warning.
 */
export function parseArenaGenerativeStructuredBrief(
  value: unknown,
  options: {
    pageHints?: ArenaGenerativePageHint[]
    entryPath?: string
    apiBindings: ArenaGenerativeApiBinding[]
  }
): ArenaGenerativeStructuredBrief | null {
  return parseStructuredBriefResult(value, options)?.brief ?? null
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
      capabilities: [] as ArenaGenerativeCapability[],
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
    actions: brief.actions.filter((action) => !action.fromPage || allowed.has(action.fromPage)),
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
      : 'No explicit page list. Infer the smallest sitemap the request needs — do not add history, stats, detail, or extra pages unless required.',
    bindingKeys.length > 0
      ? `Declared API bindings (remote actions use source "binding:<key>"; inputSchema is the form, outputSchema/layoutPlan is the result):\n${JSON.stringify(bindingsSummary, null, 2)}`
      : 'No API bindings. Bindings are the remote data contract. When none are declared, data.mode may be dummy or local and actions are still required for requested mutations — use source dummy or local, never invent API keys.',
    params.designNotes?.trim() ? `Design notes:\n${params.designNotes.trim()}` : '',
    params.visualBrief ? formatVisualBriefForPlanner(params.visualBrief) : '',
    `User request:\n${params.userInput.trim() || MATCH_SCREENSHOT_USER_INPUT}`,
  ]
    .filter((section) => section.length > 0)
    .join('\n\n')
}

const BRIEF_REPAIR_USER_MESSAGE =
  'That was not a valid structured brief. Return one JSON object in the planner blueprint shape (title, purpose, audience, complexity, archetype, shell?, entryPath, entities?, pages[] with archetype, data.mode, capabilities?, regions?, actions[] with source dummy|local|binding:<key>, design?). Do not emit a manifest.'

export type PlanStructuredBriefOutcome = {
  brief: ArenaGenerativeStructuredBrief | null
  error?: string
  droppedActions?: DroppedBriefAction[]
  uncoordinatedPages?: string[]
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
  if (!userInput && !params.visualBrief) {
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
    const bindingKeys = params.apiBindings.map((binding) => binding.key).filter(Boolean)
    let usableWithIssues: (ParsedStructuredBrief & { uncoordinatedPages: string[] }) | null =
      null

    for (let attempt = 0; attempt < MAX_BRIEF_ATTEMPTS; attempt += 1) {
      const message = await createAnthropicMessage(anthropic, { ...messageOptions, messages })
      const rawText = extractMessageText(message)
      if (!rawText) {
        continue
      }
      let parsedBrief: ParsedStructuredBrief | null = null
      try {
        const parsed = parseLlmJsonObject(rawText)
        parsedBrief = parseStructuredBriefResult(parsed, parseOptions)
      } catch {
        parsedBrief = null
      }
      if (parsedBrief) {
        const withIntent = params.intent
          ? { ...parsedBrief.brief, intent: params.intent }
          : parsedBrief.brief
        const uncoordinatedPages = uncoordinatedWorkspacePages(withIntent)
        const hasRepairableIssues =
          parsedBrief.droppedActions.length > 0 || uncoordinatedPages.length > 0
        if (hasRepairableIssues && attempt + 1 < MAX_BRIEF_ATTEMPTS) {
          usableWithIssues = {
            brief: withIntent,
            droppedActions: parsedBrief.droppedActions,
            uncoordinatedPages,
          }
          messages.push(
            { role: 'assistant', content: rawText },
            {
              role: 'user',
              content: plannerIssueRepairMessage(
                parsedBrief.droppedActions,
                uncoordinatedPages,
                bindingKeys
              ),
            }
          )
          continue
        }
        return {
          brief: withIntent,
          ...(parsedBrief.droppedActions.length > 0
            ? { droppedActions: parsedBrief.droppedActions }
            : {}),
          ...(uncoordinatedPages.length > 0 ? { uncoordinatedPages } : {}),
        }
      }
      if (attempt + 1 < MAX_BRIEF_ATTEMPTS) {
        messages.push(
          { role: 'assistant', content: rawText },
          { role: 'user', content: BRIEF_REPAIR_USER_MESSAGE }
        )
      }
    }
    if (usableWithIssues) {
      logger.warn(
        usableWithIssues.droppedActions.length > 0
          ? 'Arena Generative UI planner kept a brief after dropping invented actions'
          : 'Arena Generative UI planner kept a brief with uncoordinated Workspace regions'
      )
      return {
        brief: usableWithIssues.brief,
        ...(usableWithIssues.droppedActions.length > 0
          ? { droppedActions: usableWithIssues.droppedActions }
          : {}),
        ...(usableWithIssues.uncoordinatedPages.length > 0
          ? { uncoordinatedPages: usableWithIssues.uncoordinatedPages }
          : {}),
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
