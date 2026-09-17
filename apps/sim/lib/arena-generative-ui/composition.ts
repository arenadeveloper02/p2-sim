import { z } from 'zod'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

interface CompositionBriefPage {
  path: string
  title?: string
  purpose?: string
  archetype?: string
  regions?: { inspector?: unknown; navigator?: unknown; primary?: unknown; auxiliary?: unknown }
}

interface CompositionBrief {
  pages: CompositionBriefPage[]
  archetype?: string
  shell?: { navigation?: string }
  capabilities?: string[]
  composition?: ArenaGenerativeComposition
}

export const ARENA_GENERATIVE_AFTER_SUBMIT = ['replace', 'stack', 'alongside'] as const
export const ARENA_GENERATIVE_NAVIGATE_WHEN = ['immediate', 'success'] as const
export const ARENA_GENERATIVE_INSPECT_MODE = ['none', 'same-page', 'navigate'] as const
export const ARENA_GENERATIVE_HISTORY_MODE = ['none', 'peer-tab'] as const
export const ARENA_GENERATIVE_MUTATIONS_MODE = ['local', 'pages'] as const
export const ARENA_GENERATIVE_PLAN_STATUSES = ['planned', 'generated'] as const

export type ArenaGenerativeAfterSubmit = (typeof ARENA_GENERATIVE_AFTER_SUBMIT)[number]
export type ArenaGenerativeNavigateWhen = (typeof ARENA_GENERATIVE_NAVIGATE_WHEN)[number]
export type ArenaGenerativeInspectMode = (typeof ARENA_GENERATIVE_INSPECT_MODE)[number]
export type ArenaGenerativeHistoryMode = (typeof ARENA_GENERATIVE_HISTORY_MODE)[number]
export type ArenaGenerativeMutationsMode = (typeof ARENA_GENERATIVE_MUTATIONS_MODE)[number]
export type ArenaGenerativePlanStatus = (typeof ARENA_GENERATIVE_PLAN_STATUSES)[number]

export interface ArenaGenerativeComposition {
  afterSubmit: ArenaGenerativeAfterSubmit
  navigateWhen?: ArenaGenerativeNavigateWhen
  inspect: ArenaGenerativeInspectMode
  history: ArenaGenerativeHistoryMode
  mutations: ArenaGenerativeMutationsMode
}

export const arenaGenerativeCompositionSchema = z.object({
  afterSubmit: z.enum(ARENA_GENERATIVE_AFTER_SUBMIT),
  navigateWhen: z.enum(ARENA_GENERATIVE_NAVIGATE_WHEN).optional(),
  inspect: z.enum(ARENA_GENERATIVE_INSPECT_MODE),
  history: z.enum(ARENA_GENERATIVE_HISTORY_MODE),
  mutations: z.enum(ARENA_GENERATIVE_MUTATIONS_MODE),
})

export const arenaGenerativeCompositionPatchSchema = z.object({
  afterSubmit: z.enum(ARENA_GENERATIVE_AFTER_SUBMIT).optional(),
  navigateWhen: z.enum(ARENA_GENERATIVE_NAVIGATE_WHEN).optional(),
  inspect: z.enum(ARENA_GENERATIVE_INSPECT_MODE).optional(),
  history: z.enum(ARENA_GENERATIVE_HISTORY_MODE).optional(),
  mutations: z.enum(ARENA_GENERATIVE_MUTATIONS_MODE).optional(),
})

export type ArenaGenerativeCompositionPatch = z.input<typeof arenaGenerativeCompositionPatchSchema>

export const ARENA_GENERATIVE_IA_PRESET_IDS = [
  'stay-on-page',
  'task-then-results',
  'agent-with-history',
  'one-list',
  'list-then-detail',
  'keep-both-visible',
  'monitor',
  'step-by-step-form',
] as const

export type ArenaGenerativeIaPresetId = (typeof ARENA_GENERATIVE_IA_PRESET_IDS)[number]

export interface ArenaGenerativeIaPreset {
  id: ArenaGenerativeIaPresetId
  label: string
  purpose: string
  composition: ArenaGenerativeComposition
}

export const ARENA_GENERATIVE_IA_PRESETS: readonly ArenaGenerativeIaPreset[] = [
  {
    id: 'stay-on-page',
    label: 'Stay on page',
    purpose: 'Generate or analyze without leaving the form. Results stack below.',
    composition: {
      afterSubmit: 'stack',
      inspect: 'none',
      history: 'none',
      mutations: 'local',
    },
  },
  {
    id: 'task-then-results',
    label: 'Task then results',
    purpose: 'Submit replaces the form with a report.',
    composition: {
      afterSubmit: 'replace',
      navigateWhen: 'success',
      inspect: 'none',
      history: 'none',
      mutations: 'local',
    },
  },
  {
    id: 'agent-with-history',
    label: 'Agent with History',
    purpose: 'Generator, results, and previous runs as peer tabs.',
    composition: {
      afterSubmit: 'replace',
      navigateWhen: 'immediate',
      inspect: 'none',
      history: 'peer-tab',
      mutations: 'local',
    },
  },
  {
    id: 'one-list',
    label: 'One list',
    purpose: 'Dummy or local collection. Create and edit on this page.',
    composition: {
      afterSubmit: 'stack',
      inspect: 'none',
      history: 'none',
      mutations: 'local',
    },
  },
  {
    id: 'list-then-detail',
    label: 'List then detail',
    purpose: 'Browse a collection, then leave to one record.',
    composition: {
      afterSubmit: 'stack',
      inspect: 'navigate',
      history: 'none',
      mutations: 'local',
    },
  },
  {
    id: 'keep-both-visible',
    label: 'Keep both visible',
    purpose: 'Parent and child stay on screen together.',
    composition: {
      afterSubmit: 'alongside',
      inspect: 'same-page',
      history: 'none',
      mutations: 'local',
    },
  },
  {
    id: 'monitor',
    label: 'Monitor',
    purpose: 'KPIs and operational signals are the job.',
    composition: {
      afterSubmit: 'stack',
      inspect: 'none',
      history: 'none',
      mutations: 'local',
    },
  },
  {
    id: 'step-by-step-form',
    label: 'Step-by-step form',
    purpose: 'Visitor walks sequential input stages, then submits.',
    composition: {
      afterSubmit: 'stack',
      inspect: 'none',
      history: 'none',
      mutations: 'pages',
    },
  },
]

const PLAN_STATUS_KEY = 'planStatus'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asClosedEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  if (typeof value !== 'string') return undefined
  if ((allowed as readonly string[]).includes(value)) return value as T
  const kebab = value.replace(/_/g, '-')
  return (allowed as readonly string[]).includes(kebab) ? (kebab as T) : undefined
}

function pageArchetype(page: { archetype?: string; path: string }): string {
  return page.archetype ?? ''
}

function hasWorkspaceRegions(brief: Pick<CompositionBrief, 'pages' | 'archetype'>): boolean {
  if (brief.archetype === 'workspace') return true
  return brief.pages.some(
    (page) =>
      page.archetype === 'workspace' || (page.regions && Object.keys(page.regions).length > 0)
  )
}

function hasResultsPage(brief: Pick<CompositionBrief, 'pages'>): boolean {
  return brief.pages.some(
    (page) => pageArchetype(page) === 'results' || page.path === 'results' || page.path === 'result'
  )
}

function hasHistoryPage(brief: Pick<CompositionBrief, 'pages'>): boolean {
  return brief.pages.some(
    (page) => page.path === 'history' || /\bhistory\b/i.test(`${page.title} ${page.purpose}`)
  )
}

function hasDetailPage(brief: Pick<CompositionBrief, 'pages'>): boolean {
  return brief.pages.some(
    (page) =>
      pageArchetype(page) === 'detail' || page.path === 'detail' || page.path.endsWith('-detail')
  )
}

function hasInspectorRegion(brief: Pick<CompositionBrief, 'pages'>): boolean {
  return brief.pages.some((page) => Boolean(page.regions?.inspector))
}

function hasTaskPage(brief: Pick<CompositionBrief, 'pages' | 'archetype'>): boolean {
  if (brief.archetype === 'task') return true
  return brief.pages.some((page) => pageArchetype(page) === 'task')
}

/**
 * Fail-open parse for planner/stored composition. Missing fields are inferred
 * from the sitemap so old drafts still lock.
 */
export function parseArenaGenerativeComposition(
  value: unknown
): ArenaGenerativeComposition | undefined {
  if (!isRecord(value)) return undefined
  const afterSubmit = asClosedEnum(
    value.afterSubmit ?? value.after_submit,
    ARENA_GENERATIVE_AFTER_SUBMIT
  )
  const inspect = asClosedEnum(value.inspect, ARENA_GENERATIVE_INSPECT_MODE)
  const history = asClosedEnum(value.history, ARENA_GENERATIVE_HISTORY_MODE)
  const mutations = asClosedEnum(value.mutations, ARENA_GENERATIVE_MUTATIONS_MODE)
  if (!afterSubmit || !inspect || !history || !mutations) return undefined
  const navigateWhen = asClosedEnum(
    value.navigateWhen ?? value.navigate_when,
    ARENA_GENERATIVE_NAVIGATE_WHEN
  )
  return {
    afterSubmit,
    inspect,
    history,
    mutations,
    ...(afterSubmit === 'replace' && navigateWhen ? { navigateWhen } : {}),
  }
}

export function inferCompositionFromBrief(
  brief: Pick<CompositionBrief, 'pages' | 'archetype' | 'shell' | 'capabilities'>
): ArenaGenerativeComposition {
  const workspace = hasWorkspaceRegions(brief)
  const results = hasResultsPage(brief)
  const history = hasHistoryPage(brief)
  const detail = hasDetailPage(brief)
  const inspector = hasInspectorRegion(brief)
  const task = hasTaskPage(brief)

  let afterSubmit: ArenaGenerativeAfterSubmit = 'stack'
  if (workspace) afterSubmit = 'alongside'
  else if (results && task) afterSubmit = 'replace'

  let inspect: ArenaGenerativeInspectMode = 'none'
  if (inspector || (workspace && !detail)) inspect = 'same-page'
  else if (detail) inspect = 'navigate'

  return {
    afterSubmit,
    ...(afterSubmit === 'replace' ? { navigateWhen: 'immediate' as const } : {}),
    inspect,
    history: history || brief.shell?.navigation === 'tabs' ? 'peer-tab' : 'none',
    mutations: brief.pages.some((page) => /create|edit/i.test(page.path)) ? 'pages' : 'local',
  }
}

export function compositionForBrief(
  brief: Pick<CompositionBrief, 'pages' | 'archetype' | 'shell' | 'capabilities' | 'composition'>
): ArenaGenerativeComposition {
  return brief.composition ?? inferCompositionFromBrief(brief)
}

export function withComposition<T extends CompositionBrief>(brief: T): T {
  if (brief.composition) {
    const parsed = parseArenaGenerativeComposition(brief.composition)
    if (parsed) return { ...brief, composition: parsed }
  }
  return { ...brief, composition: inferCompositionFromBrief(brief) }
}

export function patchComposition<T extends CompositionBrief>(
  brief: T,
  patch: ArenaGenerativeCompositionPatch
): T {
  const current = compositionForBrief(brief)
  const next: ArenaGenerativeComposition = {
    afterSubmit: patch.afterSubmit ?? current.afterSubmit,
    inspect: patch.inspect ?? current.inspect,
    history: patch.history ?? current.history,
    mutations: patch.mutations ?? current.mutations,
  }
  const navigateWhen =
    next.afterSubmit === 'replace'
      ? (patch.navigateWhen ?? current.navigateWhen ?? 'immediate')
      : undefined
  if (navigateWhen) next.navigateWhen = navigateWhen
  return { ...brief, composition: next }
}

export function applyIaPreset<T extends CompositionBrief>(
  brief: T,
  presetId: ArenaGenerativeIaPresetId
): T {
  const preset = ARENA_GENERATIVE_IA_PRESETS.find((item) => item.id === presetId)
  if (!preset) return brief
  return { ...brief, composition: { ...preset.composition } }
}

export function compositionSitemapIssues(
  brief: Pick<CompositionBrief, 'pages' | 'archetype' | 'shell' | 'composition'>
): string[] {
  const composition = compositionForBrief(brief)
  const issues: string[] = []
  const workspace = hasWorkspaceRegions(brief)
  const results = hasResultsPage(brief)
  const history = hasHistoryPage(brief)
  const detail = hasDetailPage(brief)
  const inspector = hasInspectorRegion(brief)

  if (composition.afterSubmit === 'replace' && !results) {
    issues.push('replace requires a results page')
  }
  if (composition.afterSubmit === 'stack' && workspace) {
    issues.push('stack must not use a Workspace page')
  }
  if (composition.afterSubmit === 'alongside' && !workspace) {
    issues.push('alongside requires a Workspace page with named regions')
  }
  if (composition.inspect === 'same-page' && detail && !inspector && !workspace) {
    issues.push('same-page inspect must not add a detail route')
  }
  if (composition.inspect === 'navigate' && !detail) {
    issues.push('inspect navigate requires a detail page')
  }
  if (composition.history === 'peer-tab' && !history) {
    issues.push('History peer-tab requires a History collection page')
  }
  if (composition.mutations === 'local') {
    const extraMutationPages = brief.pages.filter((page) =>
      /^(create|edit|new|add)(-|$)/i.test(page.path)
    )
    if (extraMutationPages.length > 0) {
      issues.push('local mutations must not add create or edit routes')
    }
  }
  return issues
}

export function resolvedNavigateWhen(
  composition: ArenaGenerativeComposition | undefined,
  options?: { stream?: boolean }
): ArenaGenerativeNavigateWhen {
  if (composition?.afterSubmit !== 'replace') return 'immediate'
  if (options?.stream) return 'immediate'
  return composition.navigateWhen ?? 'immediate'
}

export function actionNavigatesImmediately(action: {
  onSuccess?: { navigate?: string; navigateWhen?: string }
}): boolean {
  const navigate = action.onSuccess?.navigate?.trim()
  if (!navigate) return false
  return action.onSuccess?.navigateWhen !== 'success'
}

/**
 * Stamp `onSuccess.navigateWhen` from the locked composition so the host does
 * not have to re-infer. Streaming actions stay immediate.
 */
export function applyCompositionToManifest(
  manifest: ArenaGenerativeAppManifest,
  composition: ArenaGenerativeComposition | undefined,
  options?: { streamingActionIds?: ReadonlySet<string> }
): ArenaGenerativeAppManifest {
  if (!composition || composition.afterSubmit !== 'replace') return manifest
  const streaming = options?.streamingActionIds ?? new Set<string>()
  const nextActions: ArenaGenerativeAppManifest['actions'] = {}
  let changed = false
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    const navigate = action.onSuccess?.navigate?.trim()
    if (!navigate) {
      nextActions[actionId] = action
      continue
    }
    const navigateWhen = resolvedNavigateWhen(composition, { stream: streaming.has(actionId) })
    const current = action.onSuccess?.navigateWhen
    if (current === navigateWhen || (navigateWhen === 'immediate' && !current)) {
      nextActions[actionId] = action
      continue
    }
    changed = true
    nextActions[actionId] = {
      ...action,
      onSuccess: {
        ...action.onSuccess,
        navigate,
        navigateWhen,
      },
    }
  }
  return changed ? { ...manifest, actions: nextActions } : manifest
}

export function parseStoredPlanStatus(value: unknown): ArenaGenerativePlanStatus {
  if (isRecord(value) && value[PLAN_STATUS_KEY] === 'planned') return 'planned'
  return 'generated'
}

export function withStoredPlanStatus(
  packed: Record<string, unknown> | null | undefined,
  status: ArenaGenerativePlanStatus
): Record<string, unknown> | null {
  if (!packed && status === 'generated') return packed ?? null
  const next = { ...(packed ?? {}) }
  if (status === 'planned') next[PLAN_STATUS_KEY] = 'planned'
  else delete next[PLAN_STATUS_KEY]
  return Object.keys(next).length === 0 ? null : next
}

export function isPlannedOnlyManifest(
  manifest: ArenaGenerativeAppManifest | null | undefined
): boolean {
  if (!manifest) return true
  return Object.keys(manifest.pages ?? {}).length === 0
}

export function plannedPlaceholderManifest(entryPath?: string): ArenaGenerativeAppManifest {
  const path = entryPath?.trim() || 'home'
  return { entryPath: path, pages: {}, actions: {} }
}

export function isLaunchableGenerativeDraft(
  packedBrief: unknown,
  manifest?: ArenaGenerativeAppManifest | null
): boolean {
  if (parseStoredPlanStatus(packedBrief) === 'planned') return false
  return !isPlannedOnlyManifest(manifest)
}

export interface ArenaGenerativeProductContractPage {
  path: string
  title?: string
  purpose?: string
  archetype?: string
  regions?: CompositionBriefPage['regions']
}

export interface ArenaGenerativeProductContract {
  planStatus: ArenaGenerativePlanStatus
  composition?: ArenaGenerativeComposition
  pages: ArenaGenerativeProductContractPage[]
  actions: unknown[]
  capabilities: string[]
  compositionIssues: string[]
}

export function productContractFromBrief(
  brief: CompositionBrief | null | undefined,
  packedBrief?: unknown
): ArenaGenerativeProductContract {
  const planStatus = parseStoredPlanStatus(packedBrief)
  if (!brief) {
    return {
      planStatus,
      pages: [],
      actions: [],
      capabilities: [],
      compositionIssues: [],
    }
  }
  const withComp = withComposition(brief)
  return {
    planStatus,
    composition: withComp.composition,
    pages: withComp.pages.map((page) => ({
      path: page.path,
      title: page.title,
      purpose: page.purpose,
      archetype: page.archetype,
      ...(page.regions ? { regions: page.regions } : {}),
    })),
    actions: Array.isArray((brief as { actions?: unknown[] }).actions)
      ? ((brief as { actions?: unknown[] }).actions ?? [])
      : [],
    capabilities: Array.isArray(brief.capabilities) ? brief.capabilities : [],
    compositionIssues: compositionSitemapIssues(withComp),
  }
}

export function formatCompositionForGenerator(composition: ArenaGenerativeComposition): string {
  const navigate =
    composition.afterSubmit === 'replace'
      ? composition.navigateWhen === 'success'
        ? 'Leave the form only after the CTA succeeds. Wait and errors stay on the form. Do not navigate first.'
        : 'Navigate immediately on submit (wait chrome on Results). Streaming generate uses this.'
      : ''
  return [
    'COMPOSITION CONTRACT (honour this; sitemap must match):',
    JSON.stringify(composition),
    composition.afterSubmit === 'replace'
      ? `afterSubmit replace: emit a results page. ${navigate}`
      : '',
    composition.afterSubmit === 'stack'
      ? 'afterSubmit stack: one task page. Stack wait then results below the form. Not Workspace. Not a two-column empty results pane.'
      : '',
    composition.afterSubmit === 'alongside'
      ? 'afterSubmit alongside: one Workspace page with named regions and pages[].interaction. Do not invent extra entity routes.'
      : '',
    composition.inspect === 'same-page'
      ? 'inspect same-page: keep the collection visible. No extra detail route.'
      : '',
    composition.inspect === 'navigate' ? 'inspect navigate: emit a detail page.' : '',
    composition.history === 'peer-tab'
      ? 'history peer-tab: emit a History collection page and shell tabs. Do not drop History because Generator is one view.'
      : 'history none: do not invent a History page.',
    composition.mutations === 'local'
      ? 'mutations local: create/edit/complete stay on the page (dialog or inline). No create or edit routes.'
      : '',
  ]
    .filter((line) => line.length > 0)
    .join('\n')
}
