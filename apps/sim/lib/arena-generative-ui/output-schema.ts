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

const SAMPLE_ENVELOPE_KEYS = new Set(['data', 'status', 'headers'])

/**
 * Strips GUI-app `{ ok, data }` and Response-block `{ data, status, headers }`
 * wrappers so a network-tab paste is walked from the business body
 * (`run_data.history`), not from `data.data.run_data`.
 */
export function unwrapPastedSample(data: unknown, depth = 0): unknown {
  if (depth > 6) {
    return data
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data
  }
  const record = data as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 0 || !Object.hasOwn(record, 'data')) {
    return data
  }
  if (typeof record.ok === 'boolean') {
    return unwrapPastedSample(record.data, depth + 1)
  }
  if (keys.every((key) => SAMPLE_ENVELOPE_KEYS.has(key))) {
    return unwrapPastedSample(record.data, depth + 1)
  }
  return data
}

/**
 * Derives a flat name/type list from a sample API response so the generator can
 * bind Table/Stat/KeyValue/DataText to real paths. Only names and types are
 * returned — sample values are discarded, so pasted data never leaves the caller.
 *
 * Action/Response envelopes are stripped first. Names are usable as `statePath`
 * values: an object body merges its keys (`run_data.history`, `history[].id`),
 * while an array or scalar lands under `result`. Arrays are described from their
 * first element. Walks at most 3 object levels after unwrap and returns at most
 * 40 fields, truncating silently.
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
  parsed = unwrapPastedSample(parsed)
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
  if (fields.length >= MAX_FIELDS) {
    return
  }
  const depthCap = path.includes('[]') ? MAX_DEPTH + 2 : MAX_DEPTH
  if (depth > depthCap) {
    recordArraysAtCap(value, path, fields)
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

function recordArraysAtCap(
  value: unknown,
  path: string,
  fields: ArenaGenerativeSchemaField[]
): void {
  if (fields.length >= MAX_FIELDS) {
    return
  }
  if (Array.isArray(value)) {
    if (path) {
      fields.push({ name: path, type: 'array' })
    }
    return
  }
  if (!value || typeof value !== 'object' || !path) {
    return
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (fields.length >= MAX_FIELDS) return
    if (Array.isArray(nested)) {
      fields.push({ name: `${path}.${key}`, type: 'array' })
    }
  }
}

function schemaTypeFromValue(value: unknown): string {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

/**
 * Compact fake response object from outputSchema names/types so the generator
 * can pick Stat vs Table vs DataText. Nested paths such as `run_data.history[].id`
 * become `{ run_data: { history: [{ id: 'ex-1', title: 'Example' }] } }`.
 * Values are synthetic — never user PII.
 */
export function syntheticExampleFromOutputSchema(
  schema: Array<{ name: string; type: string }> | undefined
): Record<string, unknown> | undefined {
  if (!schema || schema.length === 0) return undefined
  const example: Record<string, unknown> = {}
  for (const field of schema) {
    setExamplePath(example, field.name, field.type.trim() || 'string')
  }
  return Object.keys(example).length > 0 ? example : undefined
}

function setExamplePath(root: Record<string, unknown>, path: string, type: string): void {
  const tokens = tokenizeSchemaPath(path)
  if (tokens.length === 0) return

  let cursor: Record<string, unknown> | unknown[] = root
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    const isLast = index === tokens.length - 1
    const container = arrayExampleItem(cursor)
    if (!container) return

    if (isLast) {
      if (token.isArray || type === 'array') {
        if (!Array.isArray(container[token.key])) {
          container[token.key] = [exampleArrayItem()]
        }
      } else if (type === 'object') {
        if (!isExampleRecord(container[token.key])) {
          container[token.key] = {}
        }
      } else if (container[token.key] === undefined) {
        container[token.key] = exampleScalar(type)
      }
      return
    }

    if (token.isArray) {
      if (!Array.isArray(container[token.key])) {
        container[token.key] = [exampleArrayItem()]
      }
      cursor = container[token.key] as unknown[]
      continue
    }

    if (!isExampleRecord(container[token.key]) && !Array.isArray(container[token.key])) {
      container[token.key] = {}
    }
    cursor = container[token.key] as Record<string, unknown> | unknown[]
  }
}

function tokenizeSchemaPath(path: string): Array<{ key: string; isArray: boolean }> {
  return path
    .split('.')
    .map((part) => {
      const isArray = part.includes('[]')
      const key = part.replace(/\[\]/g, '').trim()
      return { key, isArray }
    })
    .filter((token) => token.key.length > 0)
}

function arrayExampleItem(
  cursor: Record<string, unknown> | unknown[]
): Record<string, unknown> | undefined {
  if (Array.isArray(cursor)) {
    if (!isExampleRecord(cursor[0])) {
      cursor[0] = exampleArrayItem()
    }
    return cursor[0] as Record<string, unknown>
  }
  return cursor
}

function exampleArrayItem(): Record<string, unknown> {
  return { title: 'Example', id: 'ex-1' }
}

function exampleScalar(type: string): string | number | boolean {
  if (type === 'number') return 72
  if (type === 'boolean') return true
  return 'example'
}

function isExampleRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
    if (schemaRootPresent(root, field.name, state, schema)) continue
    missing.push(root)
  }
  if (missing.length === 0) return undefined
  const noun = missing.length === 1 ? 'field' : 'fields'
  return `Response is missing outputSchema ${noun}: ${missing.join(', ')}`
}

function schemaRootPresent(
  root: string,
  fieldName: string,
  state: Record<string, unknown>,
  schema: Array<{ name: string }>
): boolean {
  if (Object.hasOwn(state, root)) return true
  for (const field of schema) {
    if (outputSchemaRootName(field.name) !== root) continue
    const leaf = field.name.replace(/\[\]/g, '').split('.').filter(Boolean).pop()
    if (leaf && Object.hasOwn(state, leaf)) return true
  }
  const leaf = fieldName.replace(/\[\]/g, '').split('.').filter(Boolean).pop()
  return Boolean(leaf && Object.hasOwn(state, leaf))
}
