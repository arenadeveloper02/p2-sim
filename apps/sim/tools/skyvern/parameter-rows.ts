/**
 * Shared helpers for Skyvern workflow parameter rows stored in input-format subblocks.
 */

export type SkyvernWorkflowParameterType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'json'
  | 'file_url'
  | 'credential_id'

export interface SkyvernWorkflowParameterRow {
  key: string
  workflow_parameter_type: SkyvernWorkflowParameterType
  description?: string | null
  default_value?: unknown
}

interface InputFormatField {
  id?: string
  name?: string
  type?: string
  value?: unknown
  description?: string
}

const SKYVERN_WORKFLOW_PARAMETER_TYPES = new Set<SkyvernWorkflowParameterType>([
  'string',
  'integer',
  'float',
  'boolean',
  'json',
  'file_url',
  'credential_id',
])

function mapInputFormatTypeToWorkflowParameterType(
  type: string | undefined
): SkyvernWorkflowParameterType {
  switch (type) {
    case 'integer':
    case 'float':
    case 'boolean':
    case 'json':
    case 'file_url':
    case 'credential_id':
      return type
    case 'number':
      return 'integer'
    case 'object':
    case 'array':
      return 'json'
    case 'file[]':
      return 'file_url'
    default:
      return 'string'
  }
}

function coerceDefaultValue(
  rawValue: unknown,
  parameterType: SkyvernWorkflowParameterType
): unknown {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return null
  }

  if (typeof rawValue !== 'string') {
    return rawValue
  }

  const trimmed = rawValue.trim()
  if (trimmed === '') return null

  switch (parameterType) {
    case 'integer': {
      const parsed = Number.parseInt(trimmed, 10)
      return Number.isFinite(parsed) ? parsed : trimmed
    }
    case 'float': {
      const parsed = Number.parseFloat(trimmed)
      return Number.isFinite(parsed) ? parsed : trimmed
    }
    case 'boolean':
      if (trimmed === 'true') return true
      if (trimmed === 'false') return false
      return trimmed
    case 'json':
      try {
        return JSON.parse(trimmed)
      } catch {
        return trimmed
      }
    default:
      return trimmed
  }
}

function coerceRunValue(rawValue: unknown, parameterType: SkyvernWorkflowParameterType): unknown {
  if (rawValue === undefined || rawValue === null) return rawValue
  if (typeof rawValue === 'boolean' && parameterType === 'boolean') return rawValue
  if (typeof rawValue === 'number' && (parameterType === 'integer' || parameterType === 'float')) {
    return rawValue
  }
  if (typeof rawValue !== 'string') return rawValue
  return coerceDefaultValue(rawValue, parameterType)
}

/**
 * Parses input-format rows into Skyvern workflow parameter definitions for create workflow.
 */
export function parseSkyvernWorkflowParameterRows(rows: unknown): SkyvernWorkflowParameterRow[] {
  if (!Array.isArray(rows)) return []

  const parameters: SkyvernWorkflowParameterRow[] = []

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const field = row as InputFormatField
    const key = typeof field.name === 'string' ? field.name.trim() : ''
    if (!key) continue

    const workflowParameterType = mapInputFormatTypeToWorkflowParameterType(field.type)
    const description =
      typeof field.description === 'string' && field.description.trim()
        ? field.description.trim()
        : null

    parameters.push({
      key,
      workflow_parameter_type: workflowParameterType,
      description,
      default_value: coerceDefaultValue(field.value, workflowParameterType),
    })
  }

  return parameters
}

/**
 * Converts input-format rows into a parameters object for run workflow requests.
 */
export function parseSkyvernRunParameterRows(rows: unknown): Record<string, unknown> {
  if (!Array.isArray(rows)) return {}

  const parameters: Record<string, unknown> = {}

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const field = row as InputFormatField
    const key = typeof field.name === 'string' ? field.name.trim() : ''
    if (!key) continue

    const parameterType = mapInputFormatTypeToWorkflowParameterType(field.type)
    const coerced = coerceRunValue(field.value, parameterType)
    if (coerced === undefined || coerced === null || coerced === '') continue
    parameters[key] = coerced
  }

  return parameters
}

/**
 * Serializes workflow parameter rows to the Skyvern API YAML/JSON shape.
 */
export function toSkyvernApiWorkflowParameters(
  parameters: SkyvernWorkflowParameterRow[]
): Array<Record<string, unknown>> {
  return parameters.map((parameter) => ({
    key: parameter.key,
    parameter_type: 'workflow',
    workflow_parameter_type: parameter.workflow_parameter_type,
    description: parameter.description ?? null,
    default_value: parameter.default_value ?? null,
  }))
}

export function isSkyvernWorkflowParameterType(value: string): value is SkyvernWorkflowParameterType {
  return SKYVERN_WORKFLOW_PARAMETER_TYPES.has(value as SkyvernWorkflowParameterType)
}
