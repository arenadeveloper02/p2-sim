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
  ARENA_GENERATIVE_UI_RESPONSIVE_RULES,
  ARENA_GENERATIVE_UI_SCOPED_EDIT_RULES,
  ARENA_GENERATIVE_UI_STREAMING_OUTPUT_RULE,
  ARENA_GENERATIVE_UI_THEME_RULE,
  buildArenaGenerativeUiPrompt,
} from '@/lib/arena-generative-ui/catalog'
import { ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT } from '@/lib/arena-generative-ui/constitution'
import { goldExamplePromptForArchetype } from '@/lib/arena-generative-ui/gold-example'
import {
  type ArenaGenerativeArchetype,
  archetypeRecipe,
} from '@/lib/arena-generative-ui/structured-brief'
import { ARENA_GENERATIVE_UI_HOST_UX_PROMPT } from '@/lib/arena-generative-ui/ux-policy'

export interface BuildGeneratorSystemPromptOptions {
  archetype?: ArenaGenerativeArchetype
  hasBindings: boolean
  hasStreamingBinding: boolean
  isScopedEdit: boolean
}

function headedRules(heading: string, rules: readonly string[]): string {
  return [heading, ...rules].join('\n')
}

/**
 * Spec-LLM system prompt in pipeline order: constitution → recipe → component /
 * interaction / responsive / a11y → JSON envelope. Still one generate call.
 */
export function buildGeneratorSystemPrompt(options: BuildGeneratorSystemPromptOptions): string {
  const recipe = options.archetype ? archetypeRecipe(options.archetype) : ''
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
    ARENA_GENERATIVE_UI_CONSTITUTION_PROMPT,
    ARENA_GENERATIVE_UI_DESIGN_GUIDELINES,
    recipe,
    goldExamplePromptForArchetype(options.archetype),
    headedRules('COMPONENT RULES', ARENA_GENERATIVE_UI_COMPONENT_RULES),
    headedRules('INTERACTION / STATE RULES', [
      ARENA_GENERATIVE_UI_HOST_UX_PROMPT,
      ...ARENA_GENERATIVE_UI_INTERACTION_RULES,
    ]),
    headedRules('RESPONSIVE RULES', ARENA_GENERATIVE_UI_RESPONSIVE_RULES),
    headedRules('ACCESSIBILITY RULES', ARENA_GENERATIVE_UI_ACCESSIBILITY_RULES),
    catalogAndEnvelope,
  ]
    .filter((section) => section.length > 0)
    .join('\n\n')
}
