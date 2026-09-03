import {
  layoutPlanForBinding,
  resultLayoutFromPlan,
} from '@/lib/arena-generative-ui/binding-layout-plan'
import {
  layoutOutputSchemaFromBinding,
  syntheticExampleFromOutputSchema,
} from '@/lib/arena-generative-ui/output-schema'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'

/**
 * Binding payload for planner and generator prompts. Secrets and URLs stay off
 * the wire; descriptions, a compact synthetic example, and layoutPlan are the
 * typed contract for statePath and component choice.
 */
export function bindingsSummaryForPrompt(bindings: ArenaGenerativeApiBinding[]) {
  return bindings.map((binding) => {
    const outputSchema = layoutOutputSchemaFromBinding(binding)
    const outputExample = syntheticExampleFromOutputSchema(outputSchema)
    const layoutPlan = layoutPlanForBinding(binding)
    return {
      key: binding.key,
      label: binding.label,
      kind: binding.kind,
      inputSchema: binding.inputSchema ?? [],
      ...(binding.chatProtocol ? { chatProtocol: binding.chatProtocol } : {}),
      outputSchema,
      ...(outputExample ? { outputExample } : {}),
      ...(binding.outputSchemaWarnings && binding.outputSchemaWarnings.length > 0
        ? { outputSchemaWarnings: binding.outputSchemaWarnings }
        : {}),
      outputHint: binding.outputHint,
      stream: binding.stream === true,
      pagination: binding.pagination,
      layoutPlan,
      resultLayout: resultLayoutFromPlan(layoutPlan),
    }
  })
}
