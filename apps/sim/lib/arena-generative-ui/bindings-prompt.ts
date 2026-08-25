import { syntheticExampleFromOutputSchema } from '@/lib/arena-generative-ui/output-schema'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'

const EMBEDDED_LIST_PROSE =
  /(?:history|items|results|records|rows)\[\]\.(output|content|body|text|message|assistantContent)$/i

function resultLayoutForBinding(
  outputSchema: Array<{ name: string; type: string }>,
  outputHint: string | undefined
): string {
  if (outputSchema.some((field) => EMBEDDED_LIST_PROSE.test(field.name))) {
    return 'list items include a prose field — Repeat cards bind only short scalars; Open is Button selectItem true (no actionId); same-page detail uses showWhen "!selectedId" on the list and showWhen "selectedId" plus clearItem Back; do not bind item.output inside Repeat'
  }
  if (outputSchema.length > 0) {
    return 'bind outputSchema field names as statePath; nested arrays (run_data.history) also land as "history"'
  }
  if (outputHint) {
    return 'prose DataText matching outputHint'
  }
  return 'no outputSchema — DataText statePath "content"; do not invent Table columns'
}

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
      resultLayout: resultLayoutForBinding(outputSchema, binding.outputHint),
    }
  })
}
