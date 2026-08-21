import {
  type ArenaGenerativeSchemaField,
  outputLayoutFromSample,
} from '@/lib/arena-generative-ui/output-schema'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'
import type { WorkflowInputField } from '@/lib/workflows/input-format'

export { extractOutputSchemaFromBlocks } from '@/lib/arena-generative-ui/extract-workflow-output'

/** Type a start-block field falls back to when it declares none. */
const DEFAULT_INPUT_TYPE = 'string'

export interface WorkflowBindingSelection {
  key: string
  workflowId: string
  label?: string
  /** Start-block fields of the **deployed** workflow, which is the version a CTA runs. */
  inputFields?: WorkflowInputField[]
  /**
   * Declared output fields from a Response block or Agent `responseFormat`.
   * Used when the user does not paste a sample. A pasted sample always wins.
   */
  outputFields?: ArenaGenerativeSchemaField[]
  /** JSON sample becomes outputSchema; streamed prose becomes outputHint. */
  outputSample?: string
  stream?: boolean
}

/**
 * Maps a deployed workflow's start-block fields to a binding `inputSchema`.
 * Names, types, and descriptions are kept so the generator can label the form.
 */
export function inputSchemaFromWorkflowFields(
  fields: WorkflowInputField[] | undefined
): Array<{ name: string; type: string; description?: string }> {
  if (!fields) return []
  const seen = new Set<string>()
  const schema: Array<{ name: string; type: string; description?: string }> = []
  for (const field of fields) {
    const name = field.name?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const mapped: { name: string; type: string; description?: string } = {
      name,
      type: field.type?.trim() || DEFAULT_INPUT_TYPE,
    }
    const description = field.description?.trim()
    if (description) {
      mapped.description = description.slice(0, 200)
    }
    schema.push(mapped)
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
  const layout = outputLayoutFromSample(selection.outputSample, {
    stream: selection.stream === true,
  })
  const derivedOutputSchema = outputSchemaFromWorkflowFields(selection.outputFields)
  const outputSchema = layout.outputSchema ?? derivedOutputSchema

  return {
    key,
    label: selection.label?.trim() || key,
    kind: 'workflow',
    workflowId,
    ...(inputSchema.length > 0 ? { inputSchema } : {}),
    ...(outputSchema && outputSchema.length > 0 ? { outputSchema } : {}),
    ...(layout.outputHint ? { outputHint: layout.outputHint } : {}),
    ...(selection.stream ? { stream: true } : {}),
  }
}

/**
 * Maps declared Response/Agent fields to a binding `outputSchema`. Names and
 * types are kept so the generator can bind Table/Stat paths.
 */
export function outputSchemaFromWorkflowFields(
  fields: ArenaGenerativeSchemaField[] | undefined
): ArenaGenerativeSchemaField[] | undefined {
  if (!fields || fields.length === 0) return undefined
  const seen = new Set<string>()
  const schema: ArenaGenerativeSchemaField[] = []
  for (const field of fields) {
    const name = field.name?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    schema.push({
      name,
      type: field.type?.trim() || DEFAULT_INPUT_TYPE,
    })
  }
  return schema.length > 0 ? schema : undefined
}
