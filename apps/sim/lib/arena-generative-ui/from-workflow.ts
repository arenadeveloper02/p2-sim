import {
  compactInputSchemaField,
  inferInputFieldSource,
} from '@/lib/arena-generative-ui/input-schema'
import {
  type ArenaGenerativeSchemaField,
  outputLayoutFromSample,
} from '@/lib/arena-generative-ui/output-schema'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeInputSchemaField,
} from '@/lib/arena-generative-ui/types'
import type { WorkflowInputField } from '@/lib/workflows/input-format'

export {
  declaredOutputSchemaNeedsLastRunFallback,
  extractOutputSchemaFromBlocks,
} from '@/lib/arena-generative-ui/extract-workflow-output'

/** Type a start-block field falls back to when it declares none. */
const DEFAULT_INPUT_TYPE = 'string'

export interface WorkflowBindingSelection {
  key: string
  workflowId: string
  label?: string
  /** Start-block fields of the **deployed** workflow, which is the version a CTA runs. */
  inputFields?: WorkflowInputField[]
  /**
   * Declared output fields from a Response block, Agent `responseFormat`, or
   * last successful run. Used when the user does not paste a sample. A pasted
   * sample always wins.
   */
  outputFields?: ArenaGenerativeSchemaField[]
  /** Last-run warnings when `outputFields` came from a completed execution. */
  outputSchemaWarnings?: string[]
  /** JSON sample becomes outputSchema; streamed prose becomes outputHint. */
  outputSample?: string
  stream?: boolean
}

/**
 * Maps a deployed workflow's start-block fields to a binding `inputSchema`.
 * Names, types, and descriptions are kept so the generator can label the form.
 * Actor-specific names (`userEmail`, `loggedInEmail`, …) default to
 * `visitorEmail` so the host sends the signed-in address without a form field.
 * A field named `email` stays a form control — that is the lead/contact address.
 */
export function inputSchemaFromWorkflowFields(
  fields: WorkflowInputField[] | undefined
): ArenaGenerativeInputSchemaField[] {
  if (!fields) return []
  const seen = new Set<string>()
  const schema: ArenaGenerativeInputSchemaField[] = []
  for (const field of fields) {
    const name = field.name?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const description = field.description?.trim()
    schema.push(
      compactInputSchemaField({
        name,
        type: field.type?.trim() || DEFAULT_INPUT_TYPE,
        ...(description ? { description: description.slice(0, 200) } : {}),
        source: inferInputFieldSource(name),
      })
    )
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
  const fromSample = Boolean(layout.outputSchema && layout.outputSchema.length > 0)

  return {
    key,
    label: selection.label?.trim() || key,
    kind: 'workflow',
    workflowId,
    ...(inputSchema.length > 0 ? { inputSchema } : {}),
    ...(outputSchema && outputSchema.length > 0 ? { outputSchema } : {}),
    ...(fromSample ? { outputSchemaSource: 'sample' as const } : {}),
    ...(!fromSample && (selection.outputSchemaWarnings?.length ?? 0) > 0
      ? { outputSchemaWarnings: selection.outputSchemaWarnings }
      : {}),
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
