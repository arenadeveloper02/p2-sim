import { truncate } from '@sim/utils/string'

const MAX_DEPTH = 3
const MAX_FIELDS = 40
/** Max characters kept from a streamed prose example in `outputHint`. */
export const OUTPUT_HINT_MAX_LENGTH = 2000

export interface ArenaGenerativeSchemaField {
  name: string
  type: string
}

/**
 * Key a non-object response lands on in host state, matching `runGenerativeAppAction`.
 */
const NON_OBJECT_ROOT_PATH = 'result'

/**
 * Derives a flat name/type list from a sample API response so the generator can
 * bind Table/Stat/KeyValue/DataText to real paths. Only names and types are
 * returned — sample values are discarded, so pasted data never leaves the caller.
 *
 * Names are usable as `statePath` values directly: an object response merges its
 * top-level keys into state (`articles`, `articles[].title`, `meta.total`), while
 * an array or scalar response lands under `result`. Arrays are described from
 * their first element only. Walks at most 3 object levels and returns at most 40
 * fields, truncating silently.
 */
export function outputSchemaFromSample(sample: string): ArenaGenerativeSchemaField[] {
  const trimmed = sample.trim()
  if (!trimmed) {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('Output format must be valid JSON')
  }
  const isPlainObject = Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed)
  const fields: ArenaGenerativeSchemaField[] = []
  collectFields(parsed, isPlainObject ? '' : NON_OBJECT_ROOT_PATH, 0, fields)
  return fields
}

/**
 * Turns an Output format paste into either `outputSchema` (JSON sample) or, for
 * streaming bindings, a truncated `outputHint` when the paste is prose.
 */
export function outputLayoutFromSample(
  sample: string | undefined,
  options?: { stream?: boolean }
): {
  outputSchema?: ArenaGenerativeSchemaField[]
  outputHint?: string
} {
  const trimmed = sample?.trim() ?? ''
  if (!trimmed) {
    return {}
  }
  try {
    const outputSchema = outputSchemaFromSample(trimmed)
    return outputSchema.length > 0 ? { outputSchema } : {}
  } catch {
    if (options?.stream === true) {
      return { outputHint: truncate(trimmed, OUTPUT_HINT_MAX_LENGTH) }
    }
    throw new Error('Output format must be valid JSON')
  }
}

/**
 * `depth` counts object levels only; the `[]` element hop is notation, not
 * nesting, so `articles[].title` stays at the same depth as `meta.total`.
 */
function collectFields(
  value: unknown,
  path: string,
  depth: number,
  fields: ArenaGenerativeSchemaField[]
): void {
  if (fields.length >= MAX_FIELDS || depth > MAX_DEPTH) {
    return
  }

  if (Array.isArray(value)) {
    if (path) {
      fields.push({ name: path, type: 'array' })
    }
    /** An empty array says nothing about its elements, so claim nothing. */
    if (value.length > 0) {
      collectFields(value[0], `${path}[]`, depth, fields)
    }
    return
  }

  if (value && typeof value === 'object') {
    /** A `[]` path already carries `array` from its parent entry. */
    if (path && !path.endsWith('[]')) {
      fields.push({ name: path, type: 'object' })
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (fields.length >= MAX_FIELDS) return
      collectFields(nested, path ? `${path}.${key}` : key, depth + 1, fields)
    }
    return
  }

  if (path) {
    fields.push({ name: path, type: schemaTypeFromValue(value) })
  }
}

function schemaTypeFromValue(value: unknown): string {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

/**
 * Root name of an outputSchema path: `articles` from `articles[].title` or `meta` from `meta.total`.
 */
export function outputSchemaRootName(fieldName: string): string {
  const trimmed = fieldName.trim()
  if (!trimmed) return ''
  const dot = trimmed.indexOf('.')
  const bracket = trimmed.indexOf('[')
  const separator = [dot, bracket].filter((index) => index >= 0).sort((a, b) => a - b)[0]
  return separator == null ? trimmed : trimmed.slice(0, separator)
}

/**
 * Warn-only check: declared top-level outputSchema names that are missing from
 * the merged action state. Nested paths are not walked — a missing `articles`
 * is enough to diagnose drift; a present array with different children is not.
 */
export function outputSchemaWarning(
  schema: Array<{ name: string }> | undefined,
  state: Record<string, unknown>
): string | undefined {
  if (!schema || schema.length === 0) return undefined
  const missing: string[] = []
  const seen = new Set<string>()
  for (const field of schema) {
    const root = outputSchemaRootName(field.name)
    if (!root || seen.has(root)) continue
    seen.add(root)
    if (!Object.hasOwn(state, root)) {
      missing.push(root)
    }
  }
  if (missing.length === 0) return undefined
  const noun = missing.length === 1 ? 'field' : 'fields'
  return `Response is missing outputSchema ${noun}: ${missing.join(', ')}`
}
