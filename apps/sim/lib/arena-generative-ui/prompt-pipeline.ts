import { ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT } from '@/lib/arena-generative-ui/action-contract'
import {
  type ArenaGenerativeCapability,
} from '@/lib/arena-generative-ui/capabilities'
import {
  ARENA_GENERATIVE_UI_ACTION_INPUT_RULE,
  ARENA_GENERATIVE_UI_ENVELOPE_RULES,
  ARENA_GENERATIVE_UI_ON_LOAD_RULE,
  ARENA_GENERATIVE_UI_PAGINATION_RULE,
  ARENA_GENERATIVE_UI_PERSONA,
  ARENA_GENERATIVE_UI_SCOPED_EDIT_RULES,
  ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE,
  ARENA_GENERATIVE_UI_THEME_RULE,
  buildArenaGenerativeUiPrompt,
  resolveCatalogComponentNames,
} from '@/lib/arena-generative-ui/catalog'
import {
  ARENA_GENERATIVE_UI_DUMMY_DATA_PROMPT,
  type ArenaGenerativeArchetype,
  type ArenaGenerativeShell,
  type ArenaGenerativeStructuredBrief,
  briefHasDummyOrLocalData,
  recipesForBlueprint,
} from '@/lib/arena-generative-ui/structured-brief'
import type {
  ArenaGenerativeProductType,
  ArenaGenerativeVisualPriority,
} from '@/lib/arena-generative-ui/design-intent'

export interface BuildGeneratorSystemPromptOptions {
  archetype?: ArenaGenerativeArchetype
  /** Precomposed recipes for every page job plus shell. Falls back to the app archetype. */
  recipes?: string
  shell?: ArenaGenerativeShell
  capabilities?: readonly ArenaGenerativeCapability[]
  hasBindings: boolean
  hasStreamingBinding: boolean
  isScopedEdit: boolean
  hasDummyData?: boolean
  needsForms?: boolean
  needsTables?: boolean
  needsCalendar?: boolean
  needsTimeline?: boolean
  needsKanban?: boolean
  needsWait?: boolean
  needsWorkspace?: boolean
  /** Planned page jobs for gold selection. Not region archetypes. */
  pageArchetypes?: readonly ArenaGenerativeArchetype[]
  /** True when any planned page declared named regions. */
  hasRegions?: boolean
  productType?: ArenaGenerativeProductType
  visualPriority?: ArenaGenerativeVisualPriority
}

const WAIT_CAPABILITIES = new Set<string>([
  'long-running',
  'streaming',
  'multi-step',
  'cancellable',
  'progress',
  'analyze',
  'generate',
])

/**
 * Derive generator prompt selection from a planned blueprint.
 */
export function generatorPromptOptionsFromBrief(
  brief: ArenaGenerativeStructuredBrief | null | undefined,
  _bindings: { hasBindings: boolean; hasStreamingBinding: boolean }
): Pick<
  BuildGeneratorSystemPromptOptions,
  | 'archetype'
  | 'recipes'
  | 'shell'
  | 'hasDummyData'
  | 'needsForms'
  | 'needsTables'
  | 'needsCalendar'
  | 'needsTimeline'
  | 'needsKanban'
  | 'needsWait'
  | 'needsWorkspace'
  | 'pageArchetypes'
  | 'hasRegions'
  | 'productType'
  | 'visualPriority'
> {
  if (!brief) {
    return {
      hasDummyData: false,
      needsForms: false,
      needsTables: false,
      needsCalendar: false,
      needsTimeline: false,
      needsKanban: false,
      needsWait: false,
      needsWorkspace: false,
      pageArchetypes: [],
      hasRegions: false,
    }
  }
  const shapes = new Set<ArenaGenerativeArchetype>([brief.archetype])
  const pageArchetypes: ArenaGenerativeArchetype[] = []
  let needsTables = brief.representation === 'table' || brief.representation === 'calendar'
  let needsCalendar = brief.representation === 'calendar'
  let needsTimeline = brief.representation === 'timeline'
  let needsKanban = brief.representation === 'kanban'
  let hasRegions = false
  let hasWorkspacePage = brief.archetype === 'workspace'
  for (const page of brief.pages ?? []) {
    if (page.archetype) {
      shapes.add(page.archetype)
      pageArchetypes.push(page.archetype)
      if (page.archetype === 'workspace') hasWorkspacePage = true
    }
    if (page.representation === 'table' || page.representation === 'calendar') needsTables = true
    if (page.representation === 'calendar') needsCalendar = true
    if (page.representation === 'timeline') needsTimeline = true
    if (page.representation === 'kanban') needsKanban = true
    if (page.regions) {
      hasRegions = true
      for (const region of Object.values(page.regions)) {
        if (region?.archetype) shapes.add(region.archetype)
        if (region?.representation === 'table' || region?.representation === 'calendar') {
          needsTables = true
        }
        if (region?.representation === 'calendar') needsCalendar = true
        if (region?.representation === 'timeline') needsTimeline = true
        if (region?.representation === 'kanban') needsKanban = true
      }
    }
  }
  const capabilities = brief.capabilities ?? []
  return {
    archetype: brief.archetype,
    recipes: recipesForBlueprint(brief),
    shell: brief.shell,
    hasDummyData: briefHasDummyOrLocalData(brief),
    needsForms: shapes.has('task') || shapes.has('workflow'),
    needsTables,
    needsCalendar,
    needsTimeline,
    needsKanban,
    needsWait: capabilities.some((capability) => WAIT_CAPABILITIES.has(capability)),
    needsWorkspace: hasWorkspacePage || hasRegions,
    pageArchetypes,
    hasRegions,
    productType: brief.designIntent?.productType,
    visualPriority: brief.designIntent?.visualPriority,
  }
}

/**
 * Spec model prompt: persona, wiring, and the catalog schema for this blueprint.
 * Archetype names stay on the brief the user message already carries.
 */
export const GENERATOR_WIRING_CONTRACT = [
  'WIRING',
  'Bind statePath only to a layoutPlan host key, or to inputs.<field>, content, selected, or selectedId. Do not invent keys. Do not prefix output., data., result., or response.',
  'A control that calls an API sets actionId to a declared action. onSuccess.navigate is a page path. navigateWhen immediate leaves before the request; success waits, and errors stay on the form.',
  'A page that shows data on arrival lists that action in onLoad. Do not onLoad a navigate-first action on the destination page.',
  'Do not emit hex, fontSize, or CSS. The host paints theme, loaders, Back, empty states, and errors.',
].join('\n')

/**
 * Spec-LLM system prompt. The brief in the user message names the archetype.
 * Catalog families stay gated so an unused widget schema is not sent.
 */
export function buildGeneratorSystemPrompt(options: BuildGeneratorSystemPromptOptions): string {
  const includeRemoteRules = options.hasBindings || options.needsWait
  const includeComponents = resolveCatalogComponentNames({
    archetype: options.archetype,
    pageArchetypes: options.pageArchetypes,
    needsForms: options.needsForms,
    needsTables: options.needsTables,
    needsWait: options.needsWait,
    needsWorkspace: options.needsWorkspace,
    shellNavigation: options.shell?.navigation,
    capabilities: options.capabilities,
  })
  const catalogAndEnvelope = buildArenaGenerativeUiPrompt({
    includeComponents,
    customRules: [
      ...ARENA_GENERATIVE_UI_ENVELOPE_RULES,
      ARENA_GENERATIVE_UI_THEME_RULE,
      GENERATOR_WIRING_CONTRACT,
      ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT,
      ...(includeRemoteRules
        ? [
            ARENA_GENERATIVE_UI_ACTION_INPUT_RULE,
            ARENA_GENERATIVE_UI_ON_LOAD_RULE,
            ARENA_GENERATIVE_UI_PAGINATION_RULE,
          ]
        : []),
      ...(options.hasDummyData ? [ARENA_GENERATIVE_UI_DUMMY_DATA_PROMPT] : []),
      ...(options.hasStreamingBinding ? [ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE] : []),
      ...(options.isScopedEdit ? ARENA_GENERATIVE_UI_SCOPED_EDIT_RULES : []),
    ],
  })

  return [ARENA_GENERATIVE_UI_PERSONA, catalogAndEnvelope].join('\n\n')
}
