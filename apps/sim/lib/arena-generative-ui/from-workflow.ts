import { outputSchemaFromSample } from '@/lib/arena-generative-ui/output-schema'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'
import type { WorkflowInputField } from '@/lib/workflows/input-format'

/** Type a start-block field falls back to when it declares none. */
const DEFAULT_INPUT_TYPE = 'string'

export interface WorkflowBindingSelection {
  key: string
  workflowId: string
  label?: string
  /** Start-block fields of the **deployed** workflow, which is the version a CTA runs. */
  inputFields?: WorkflowInputField[]
  /** Optional sample response, same derivation the curl importer uses. */
  outputSample?: string
  stream?: boolean
}

/**
 * Maps a deployed workflow's start-block fields to a binding `inputSchema`. Only
 * names and types are kept — that is all the generator needs to lay out a form, and
 * it keeps descriptions and placeholders out of the prompt.
 */
export function inputSchemaFromWorkflowFields(
  fields: WorkflowInputField[] | undefined
): Array<{ name: string; type: string }> {
  if (!fields) return []
  const seen = new Set<string>()
  const schema: Array<{ name: string; type: string }> = []
  for (const field of fields) {
    const name = field.name?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    schema.push({ name, type: field.type?.trim() || DEFAULT_INPUT_TYPE })
  }
  return schema
}

/**
 * Builds a workflow API binding from a picker selection, mirroring
 * `httpBindingFromCurl` so both importer modes produce the same shape.
 *
 * Deliberately does not check whether the workflow is deployed: the picker warns and
 * still saves, and publish is the hard gate (`performGenerativeAppDeploy` refuses an
 * undeployed binding), so wiring a binding before deploying the backend stays possible.
 */
export function workflowBindingFromSelection(
  selection: WorkflowBindingSelection
): ArenaGenerativeApiBinding {
  const key = selection.key.trim()
  if (!key) {
    throw new Error('Key is required')
  }
  const workflowId = selection.workflowId.trim()
  if (!workflowId) {
    throw new Error('Select a workflow')
  }

  const inputSchema = inputSchemaFromWorkflowFields(selection.inputFields)
  const outputSchema = selection.outputSample?.trim()
    ? outputSchemaFromSample(selection.outputSample)
    : []

  return {
    key,
    label: selection.label?.trim() || key,
    kind: 'workflow',
    workflowId,
    ...(inputSchema.length > 0 ? { inputSchema } : {}),
    ...(outputSchema.length > 0 ? { outputSchema } : {}),
    ...(selection.stream ? { stream: true } : {}),
  }
}
