import { ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT } from '@/lib/arena-generative-ui/action-contract'
import { ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT } from '@/lib/arena-generative-ui/anti-patterns'
import {
  type ArenaGenerativeCapability,
  capabilityRecipePrompt,
} from '@/lib/arena-generative-ui/capabilities'
import {
  ARENA_GENERATIVE_UI_ACCESSIBILITY_RULES,
  ARENA_GENERATIVE_UI_ACTION_INPUT_RULE,
  ARENA_GENERATIVE_UI_ACTION_RESULT_RULE,
  ARENA_GENERATIVE_UI_COMPONENT_RULES,
  ARENA_GENERATIVE_UI_DESIGN_GUIDELINES,
  ARENA_GENERATIVE_UI_ENVELOPE_RULES,
  ARENA_GENERATIVE_UI_INTERACTION_RULES,
  ARENA_GENERATIVE_UI_ON_LOAD_RULE,
  ARENA_GENERATIVE_UI_PAGINATION_RULE,
  ARENA_GENERATIVE_UI_PERSONA,
  ARENA_GENERATIVE_UI_SCOPED_EDIT_RULES,
  ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE,
  ARENA_GENERATIVE_UI_THEME_RULE,
  buildArenaGenerativeUiPrompt,
} from '@/lib/arena-generative-ui/catalog'
import { ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT } from '@/lib/arena-generative-ui/component-decisions'
import { ARENA_GENERATIVE_UI_REPRESENTATION_PROMPT } from '@/lib/arena-generative-ui/representation'
import { ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT } from '@/lib/arena-generative-ui/constitution'
import { ARENA_GENERATIVE_UI_DATA_STATE_PROMPT } from '@/lib/arena-generative-ui/data-state-contract'
import {
  ARENA_GENERATIVE_UI_COMPOSITION_PROMPT,
  ARENA_GENERATIVE_UI_HIERARCHY_PROMPT,
  ARENA_GENERATIVE_UI_LAYOUT_PROMPT,
} from '@/lib/arena-generative-ui/design-guidelines'
import { ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT } from '@/lib/arena-generative-ui/design-intent'
import { goldExamplePromptForArchetype } from '@/lib/arena-generative-ui/gold-example'
import {
  type ArenaGenerativeArchetype,
  type ArenaGenerativeShell,
  type ArenaGenerativeStructuredBrief,
  ARENA_GENERATIVE_UI_DUMMY_DATA_PROMPT,
  archetypeRecipe,
  briefHasDummyOrLocalData,
  recipesForBlueprint,
  shellRecipe,
} from '@/lib/arena-generative-ui/structured-brief'
import { ARENA_GENERATIVE_UI_HOST_UX_PROMPT } from '@/lib/arena-generative-ui/ux-policy'

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
  needsWait?: boolean
  needsWorkspace?: boolean
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
  | 'needsWait'
  | 'needsWorkspace'
> {
  if (!brief) {
    return {
      hasDummyData: false,
      needsForms: false,
      needsTables: false,
      needsWait: false,
      needsWorkspace: false,
    }
  }
  const shapes = new Set<ArenaGenerativeArchetype>([brief.archetype])
  let needsTables = brief.representation === 'table'
  for (const page of brief.pages ?? []) {
    if (page.archetype) shapes.add(page.archetype)
    if (page.representation === 'table') needsTables = true
    if (page.regions) {
      for (const region of Object.values(page.regions)) {
        if (region?.archetype) shapes.add(region.archetype)
        if (region?.representation === 'table') needsTables = true
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
    needsWait: capabilities.some((capability) => WAIT_CAPABILITIES.has(capability)),
    needsWorkspace:
      shapes.has('workspace') ||
      brief.shell?.navigation === 'sidebar' ||
      brief.shell?.navigation === 'workspace',
  }
}

function headedRules(heading: string, rules: readonly string[]): string {
  return [heading, ...rules].join('\n')
}

function wrapColumn(heading: string, sections: readonly string[]): string {
  const body = sections.filter((section) => section.length > 0)
  if (body.length === 0) return ''
  return [heading, ...body].join('\n\n')
}

function compositionFor(options: BuildGeneratorSystemPromptOptions): string {
  if (
    !options.archetype ||
    options.archetype === 'dashboard' ||
    (options.needsForms && options.needsTables) ||
    options.needsWorkspace
  ) {
    return ARENA_GENERATIVE_UI_COMPOSITION_PROMPT
  }
  if (options.needsForms || options.needsTables) {
    return [ARENA_GENERATIVE_UI_LAYOUT_PROMPT, ARENA_GENERATIVE_UI_HIERARCHY_PROMPT].join('\n\n')
  }
  return ARENA_GENERATIVE_UI_HIERARCHY_PROMPT
}

/**
 * Spec-LLM system prompt in three columns: Design rules/tokens, UX rules/states,
 * then archetype recipe. Serial order is Design → UX → Archetype so tokens still
 * constrain recipes. Persona stays first. Still one generate call. The planner
 * contract is never included.
 */
export function buildGeneratorSystemPrompt(options: BuildGeneratorSystemPromptOptions): string {
  const baseRecipe =
    options.recipes || (options.archetype ? archetypeRecipe(options.archetype) : '')
  const chrome = shellRecipe(options.shell)
  const recipe =
    chrome && !baseRecipe.includes('SHELL RECIPE')
      ? [baseRecipe, chrome].filter((section) => section.length > 0).join('\n\n')
      : baseRecipe
  const includeRemoteRules = options.hasBindings || options.needsWait
  const catalogAndEnvelope = buildArenaGenerativeUiPrompt({
    customRules: [
      ...ARENA_GENERATIVE_UI_ENVELOPE_RULES,
      ARENA_GENERATIVE_UI_THEME_RULE,
      ...(includeRemoteRules
        ? [
            ARENA_GENERATIVE_UI_ACTION_INPUT_RULE,
            ARENA_GENERATIVE_UI_ACTION_RESULT_RULE,
            ARENA_GENERATIVE_UI_ON_LOAD_RULE,
            ARENA_GENERATIVE_UI_PAGINATION_RULE,
          ]
        : []),
      ...(options.hasDummyData && !recipe.includes('DUMMY / LOCAL DATA')
        ? [ARENA_GENERATIVE_UI_DUMMY_DATA_PROMPT]
        : []),
      ...(options.hasStreamingBinding ? [ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE] : []),
      ...(options.isScopedEdit ? ARENA_GENERATIVE_UI_SCOPED_EDIT_RULES : []),
    ],
  })
  const representation = recipe.includes('REPRESENTATION')
    ? ''
    : options.needsTables
      ? ARENA_GENERATIVE_UI_REPRESENTATION_PROMPT
      : ''
  const dataState =
    includeRemoteRules || !options.hasDummyData ? ARENA_GENERATIVE_UI_DATA_STATE_PROMPT : ''
  const actionContract = ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT
  const capabilities = capabilityRecipePrompt(options.capabilities ?? [])

  return [
    ARENA_GENERATIVE_UI_PERSONA,
    wrapColumn('DESIGN RULES / TOKENS', [
      ARENA_GENERATIVE_UI_DESIGN_GUIDELINES,
      ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT,
      compositionFor(options),
    ]),
    wrapColumn('UX RULES / STATES', [
      ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT,
      dataState,
      actionContract,
      headedRules('INTERACTION / STATE RULES', [
        ARENA_GENERATIVE_UI_HOST_UX_PROMPT,
        ...ARENA_GENERATIVE_UI_INTERACTION_RULES,
      ]),
      headedRules('ACCESSIBILITY RULES', ARENA_GENERATIVE_UI_ACCESSIBILITY_RULES),
      ARENA_GENERATIVE_UI_ANTI_PATTERNS_PROMPT,
    ]),
    wrapColumn('ARCHETYPE RECIPE', [
      ARENA_GENERATIVE_UI_COMPONENT_SELECTION_PROMPT,
      recipe,
      representation,
      capabilities,
      goldExamplePromptForArchetype(options.archetype, { shell: options.shell }),
      headedRules('COMPONENT RULES', ARENA_GENERATIVE_UI_COMPONENT_RULES),
      catalogAndEnvelope,
    ]),
  ]
    .filter((section) => section.length > 0)
    .join('\n\n')
}
