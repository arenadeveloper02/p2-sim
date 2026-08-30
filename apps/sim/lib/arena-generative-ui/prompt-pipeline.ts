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
import { ARENA_GENERATIVE_UI_COMPOSITION_PROMPT } from '@/lib/arena-generative-ui/design-guidelines'
import { ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT } from '@/lib/arena-generative-ui/design-intent'
import { goldExamplePromptForArchetype } from '@/lib/arena-generative-ui/gold-example'
import {
  type ArenaGenerativeArchetype,
  archetypeRecipe,
} from '@/lib/arena-generative-ui/structured-brief'
import { ARENA_GENERATIVE_UI_HOST_UX_PROMPT } from '@/lib/arena-generative-ui/ux-policy'

export interface BuildGeneratorSystemPromptOptions {
  archetype?: ArenaGenerativeArchetype
  /** Precomposed recipes for every page/region shape. Falls back to the app archetype. */
  recipes?: string
  capabilities?: readonly ArenaGenerativeCapability[]
  hasBindings: boolean
  hasStreamingBinding: boolean
  isScopedEdit: boolean
}

function headedRules(heading: string, rules: readonly string[]): string {
  return [heading, ...rules].join('\n')
}

function wrapColumn(heading: string, sections: readonly string[]): string {
  const body = sections.filter((section) => section.length > 0)
  if (body.length === 0) return ''
  return [heading, ...body].join('\n\n')
}

/**
 * Spec-LLM system prompt in three columns: Design rules/tokens, UX rules/states,
 * then archetype recipe. Serial order is Design → UX → Archetype so tokens still
 * constrain recipes. Persona stays first. Still one generate call.
 */
export function buildGeneratorSystemPrompt(options: BuildGeneratorSystemPromptOptions): string {
  const recipe =
    options.recipes || (options.archetype ? archetypeRecipe(options.archetype) : '')
  const capabilities = capabilityRecipePrompt(options.capabilities ?? [])
  const catalogAndEnvelope = buildArenaGenerativeUiPrompt({
    customRules: [
      ...ARENA_GENERATIVE_UI_ENVELOPE_RULES,
      ARENA_GENERATIVE_UI_THEME_RULE,
      ...(options.hasBindings
        ? [
            ARENA_GENERATIVE_UI_ACTION_INPUT_RULE,
            ARENA_GENERATIVE_UI_ACTION_RESULT_RULE,
            ARENA_GENERATIVE_UI_ON_LOAD_RULE,
            ARENA_GENERATIVE_UI_PAGINATION_RULE,
          ]
        : []),
      ...(options.hasStreamingBinding ? [ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE] : []),
      ...(options.isScopedEdit ? ARENA_GENERATIVE_UI_SCOPED_EDIT_RULES : []),
    ],
  })

  return [
    ARENA_GENERATIVE_UI_PERSONA,
    wrapColumn('DESIGN RULES / TOKENS', [
      ARENA_GENERATIVE_UI_DESIGN_GUIDELINES,
      ARENA_GENERATIVE_UI_DESIGN_INTENT_PROMPT,
      ARENA_GENERATIVE_UI_COMPOSITION_PROMPT,
    ]),
    wrapColumn('UX RULES / STATES', [
      ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT,
      ARENA_GENERATIVE_UI_DATA_STATE_PROMPT,
      ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT,
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
      ARENA_GENERATIVE_UI_REPRESENTATION_PROMPT,
      capabilities,
      goldExamplePromptForArchetype(options.archetype),
      headedRules('COMPONENT RULES', ARENA_GENERATIVE_UI_COMPONENT_RULES),
      catalogAndEnvelope,
    ]),
  ]
    .filter((section) => section.length > 0)
    .join('\n\n')
}
