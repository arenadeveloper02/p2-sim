import { syntheticExampleFromOutputSchema } from '@/lib/arena-generative-ui/output-schema'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'

/**
 * Binding payload for planner and generator prompts. Secrets and URLs stay off
 * the wire; descriptions and a compact synthetic example improve layout quality.
 */
export function bindingsSummaryForPrompt(bindings: ArenaGenerativeApiBinding[]) {
  return bindings.map((binding) => {
    const outputSchema = binding.outputSchema ?? []
    const outputExample = syntheticExampleFromOutputSchema(outputSchema)
    return {
      key: binding.key,
      label: binding.label,
      kind: binding.kind,
      inputSchema: binding.inputSchema ?? [],
      outputSchema,
      ...(outputExample ? { outputExample } : {}),
      ...(binding.outputSchemaWarnings && binding.outputSchemaWarnings.length > 0
        ? { outputSchemaWarnings: binding.outputSchemaWarnings }
        : {}),
      outputHint: binding.outputHint,
      stream: binding.stream === true,
      pagination: binding.pagination,
      resultLayout:
        outputSchema.length > 0
          ? 'bind outputSchema field names as statePath; nested arrays (run_data.history) also land as "history"'
          : binding.outputHint
            ? 'prose DataText matching outputHint'
            : 'no outputSchema — DataText statePath "content"; do not invent Table columns',
    }
  })
}
