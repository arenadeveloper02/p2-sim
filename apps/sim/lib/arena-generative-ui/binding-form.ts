import type { ArenaGenerativeSchemaField } from '@/lib/arena-generative-ui/output-schema'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeInputSchemaField,
  ArenaGenerativeInputSourceOverride,
} from '@/lib/arena-generative-ui/types'

export interface ArenaApiBindingFormState {
  source: 'http' | 'workflow'
  key: string
  secretVar: string
  curl: string
  streamMode: 'off' | 'on'
  forwardEmail: 'off' | 'on'
  outputSample: string
  workflowId: string
  inputSourceOverrides: Record<string, ArenaGenerativeInputSourceOverride>
}

const EMPTY_FORM: ArenaApiBindingFormState = {
  source: 'http',
  key: '',
  secretVar: '',
  curl: '',
  streamMode: 'off',
  forwardEmail: 'off',
  outputSample: '',
  workflowId: '',
  inputSourceOverrides: {},
}

/**
 * Empty Add-an-API form. Edit hydrates from {@link formStateFromBinding}.
 */
export function emptyBindingFormState(): ArenaApiBindingFormState {
  return { ...EMPTY_FORM, inputSourceOverrides: {} }
}

/**
 * Reconstructs the modal fields for a saved binding so the user can edit it
 * without touching the read-only JSON textarea. HTTP curls are rebuilt from
 * method/url/input names — the original paste is not stored.
 */
export function formStateFromBinding(binding: ArenaGenerativeApiBinding): ArenaApiBindingFormState {
  if (binding.kind === 'workflow') {
    return {
      ...emptyBindingFormState(),
      source: 'workflow',
      key: binding.key,
      workflowId: binding.workflowId ?? '',
      streamMode: binding.stream === true ? 'on' : 'off',
      outputSample: sampleFromStoredLayout(binding),
      inputSourceOverrides: overridesFromInputSchema(binding.inputSchema),
    }
  }

  return {
    ...emptyBindingFormState(),
    source: 'http',
    key: binding.key,
    secretVar: binding.http?.headersSecretName ?? '',
    curl: curlFromHttpBinding(binding),
    streamMode: binding.stream === true ? 'on' : 'off',
    forwardEmail: binding.forwardEmailId === true ? 'on' : 'off',
    outputSample: sampleFromStoredLayout(binding),
    inputSourceOverrides: overridesFromInputSchema(binding.inputSchema),
  }
}

/**
 * Rebuilds a curl the importer can parse. Auth headers are omitted on purpose —
 * Secret var is the stored credential.
 */
export function curlFromHttpBinding(binding: ArenaGenerativeApiBinding): string {
  if (binding.kind !== 'http' || !binding.http) {
    return ''
  }
  const method = binding.http.method
  const url = binding.http.url
  const body = jsonBodyFromInputSchema(binding.inputSchema)
  if (!body) {
    return `curl -X ${method} ${url}`
  }
  return `curl -X ${method} --data-raw ${quoteCurlToken(body)} ${url}`
}

/**
 * Schema tags shown in Add an API. A live Sample paste wins; a saved Sample is
 * kept while the textarea is empty; otherwise the deployed workflow extract.
 */
export function displayedBindingOutputSchema(options: {
  sampleFields: ArenaGenerativeSchemaField[]
  liveFields: ArenaGenerativeSchemaField[]
  savedSchema?: ArenaGenerativeSchemaField[]
  savedFromSample: boolean
}): ArenaGenerativeSchemaField[] {
  if (options.sampleFields.length > 0) {
    return options.sampleFields
  }
  if (options.savedFromSample && (options.savedSchema?.length ?? 0) > 0) {
    return options.savedSchema ?? []
  }
  if (options.liveFields.length > 0) {
    return options.liveFields
  }
  return options.savedSchema ?? []
}

/**
 * When editing, an empty Sample field keeps a pasted schema. Workflow-sourced
 * schemas take the live extract so a richer deploy is not frozen on re-save.
 */
export function applyUnchangedOutputLayout(
  next: ArenaGenerativeApiBinding,
  previous: ArenaGenerativeApiBinding | undefined,
  sample: string
): ArenaGenerativeApiBinding {
  if (!previous || sample.trim()) {
    return next
  }
  if (previous.outputSchemaSource !== 'sample') {
    return next
  }
  const outputSchema =
    previous.outputSchema && previous.outputSchema.length > 0
      ? previous.outputSchema
      : next.outputSchema
  const outputHint = previous.outputHint ?? next.outputHint
  const { outputSchemaWarnings: _dropped, ...rest } = next
  return {
    ...rest,
    ...(outputSchema && outputSchema.length > 0 ? { outputSchema } : {}),
    outputSchemaSource: 'sample',
    ...(outputHint ? { outputHint } : {}),
  }
}

function sampleFromStoredLayout(binding: ArenaGenerativeApiBinding): string {
  return binding.outputHint?.trim() ?? ''
}

function overridesFromInputSchema(
  schema: ArenaGenerativeInputSchemaField[] | undefined
): Record<string, ArenaGenerativeInputSourceOverride> {
  const overrides: Record<string, ArenaGenerativeInputSourceOverride> = {}
  if (!schema) {
    return overrides
  }
  for (const field of schema) {
    if (field.source !== 'visitorEmail' && field.source !== 'constant') {
      continue
    }
    overrides[field.name] = {
      source: field.source,
      ...(field.source === 'constant' && field.value !== undefined ? { value: field.value } : {}),
    }
  }
  return overrides
}

function jsonBodyFromInputSchema(
  schema: ArenaGenerativeInputSchemaField[] | undefined
): string | undefined {
  if (!schema || schema.length === 0) {
    return undefined
  }
  const body: Record<string, string> = {}
  for (const field of schema) {
    body[field.name] = field.source === 'constant' ? (field.value ?? '') : ''
  }
  return JSON.stringify(body)
}

function quoteCurlToken(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}
