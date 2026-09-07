import { truncate } from '@sim/utils/string'
import { isActionTelemetryRoot, parseJsonLiteral } from '@/lib/arena-generative-ui/types'

const MAX_DEPTH = 3
/** Max flattened name/type rows kept from a sample or last-run body. */
export const MAX_OUTPUT_SCHEMA_FIELDS = 80
/** First and last items sampled when unioning an array's element shape. */
const MAX_ARRAY_ITEMS_SAMPLED = 12
/** Max characters kept from a streamed prose example in `outputHint`. */
export const OUTPUT_HINT_MAX_LENGTH = 2000
/** Max characters kept from Sample response so the modal can show the paste again. */
export const OUTPUT_SAMPLE_MAX_LENGTH = 16_000

/**
 * Trims Sample response for storage. Empty pastes are omitted.
 */
export function storedOutputSample(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim()
  if (!trimmed) return undefined
  return trimmed.length > OUTPUT_SAMPLE_MAX_LENGTH
    ? trimmed.slice(0, OUTPUT_SAMPLE_MAX_LENGTH)
    : trimmed
}

export interface ArenaGenerativeSchemaField {
  name: string
  type: string
}

/**
 * True when an outputSchema entry has a usable name. Nameless rows must not
 * reach `.includes` / `.indexOf` — Bun downlevels those and throws `e.indexOf`.
 */
export function hasSchemaFieldName(
  field: { name?: unknown } | null | undefined
): field is { name: string } {
  return typeof field?.name === 'string' && field.name.trim().length > 0
}

/** Drops entries without a non-empty string `name`. */
export function namedSchemaFields<T extends { name?: unknown }>(
  fields: readonly T[] | undefined
): Array<T & { name: string }> {
  return (fields ?? []).filter(hasSchemaFieldName)
}

/**
 * Key a non-object response lands on in host state, matching `runGenerativeAppAction`.
 */
const NON_OBJECT_ROOT_PATH = 'result'

const SAMPLE_ENVELOPE_KEYS = new Set(['data', 'status', 'headers'])

const SAMPLE_WRAPPER_KEYS = new Set(['data', 'output', 'result', 'response', 'body'])

/**
 * Strips GUI-app `{ ok, data }`, Response-block `{ data, status, headers }`,
 * and a singleton object wrapper (`output` / `result`) so a network-tab paste
 * or last-run `finalOutput` is walked from the business body
 * (`gap_analysis`, `run_data.history`), not from `data.data.output`.
 */
export function unwrapPastedSample(data: unknown, depth = 0): unknown {
  if (depth > 6) {
    return data
  }
  if (typeof data === 'string') {
    const parsed = parseJsonLiteral(data)
    if (parsed !== undefined) {
      return unwrapPastedSample(parsed, depth + 1)
    }
    return data
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data
  }
  const record = data as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 0) {
    return data
  }
  if (typeof record.ok === 'boolean' && Object.hasOwn(record, 'data')) {
    return unwrapPastedSample(record.data, depth + 1)
  }
  if (Object.hasOwn(record, 'data') && keys.every((key) => SAMPLE_ENVELOPE_KEYS.has(key))) {
    return unwrapPastedSample(record.data, depth + 1)
  }
  const nested = singletonEnvelopeObject(record)
  if (nested !== undefined) {
    return unwrapPastedSample(nested, depth + 1)
  }
  const spread = spreadWorkflowOutputEnvelope(record)
  if (spread) {
    return unwrapPastedSample(spread, depth + 1)
  }
  return data
}

const WORKFLOW_OUTPUT_SIBLINGS = new Set([
  'input',
  'email',
  'conversationId',
  'files',
  'id',
  'createdAt',
  'updatedAt',
  'timestamp',
  'error',
  'status',
])

/**
 * Workflow `finalOutput` is often `{ output: { coverage_report }, input, email }`.
 * Spread the object `output` onto the same record so last-run fields are
 * `coverage_report.summary`, not `output.coverage_report.summary`.
 */
function spreadWorkflowOutputEnvelope(
  record: Record<string, unknown>
): Record<string, unknown> | undefined {
  const output = record.output
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return undefined
  }
  const rest = Object.entries(record).filter(
    ([key]) => key !== 'output' && !isActionTelemetryRoot(key)
  )
  if (rest.length === 0) {
    return undefined
  }
  if (!rest.every(([key]) => WORKFLOW_OUTPUT_SIBLINGS.has(key))) {
    return undefined
  }
  return { ...(output as Record<string, unknown>), ...Object.fromEntries(rest) }
}

function singletonEnvelopeObject(record: Record<string, unknown>): unknown {
  const entries = Object.entries(record).filter(([key]) => !isActionTelemetryRoot(key))
  if (entries.length !== 1) {
    return undefined
  }
  const [key, value] = entries[0]
  if (!SAMPLE_WRAPPER_KEYS.has(key)) {
    return undefined
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return value
}

/**
 * Derives a flat name/type list from a sample API response so the generator can
 * bind Table/Stat/KeyValue/DataText to real paths. Only names and types are
 * returned — sample values are not copied into `outputSchema`. The importer
 * may keep the paste on the binding for the editor; generate uses this list
 * and a synthetic example.
 *
 * Action/Response envelopes are stripped first. Names are usable as `statePath`
 * values: an object body merges its keys (`run_data.history`, `history[].id`),
 * while an array or scalar lands under `result`. Array items are unioned from
 * sampled elements (not only the first). Walks breadth-first so later sibling
 * keys are not dropped in favor of earlier nested columns. At most 3 object
 * levels after unwrap and {@link MAX_OUTPUT_SCHEMA_FIELDS} rows; extra keys
 * are omitted and `truncated` is set on {@link deriveOutputSchema}.
 */
export function outputSchemaFromSample(sample: string): ArenaGenerativeSchemaField[] {
  return deriveOutputSchemaFromSample(sample).fields
}

/**
 * Same walk as {@link outputSchemaFromSample}, including whether the field cap
 * hid remaining keys.
 */
export function deriveOutputSchemaFromSample(sample: string): {
  fields: ArenaGenerativeSchemaField[]
  truncated: boolean
} {
  const trimmed = sample.trim()
  if (!trimmed) {
    return { fields: [], truncated: false }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('Output format must be valid JSON')
  }
  return deriveOutputSchema(parsed)
}

/**
 * Derives output schema fields from an already-parsed value (last-run
 * `finalOutput` or a JSON sample). Envelopes are stripped first.
 */
export function deriveOutputSchema(data: unknown): {
  fields: ArenaGenerativeSchemaField[]
  truncated: boolean
} {
  const parsed = unwrapPastedSample(data)
  const isPlainObject = Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed)
  const fields: ArenaGenerativeSchemaField[] = []
  const truncated = collectFields(parsed, isPlainObject ? '' : NON_OBJECT_ROOT_PATH, 0, fields)
  return { fields: rewriteOutputEnvelopes(fields), truncated }
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
 * Schema generate, validate, unwrap, and drift warning must share. Re-walks
 * Sample so a stored Response envelope (`data` + `status` + `headers`) cannot
 * require host key `data`. A markdown string in that envelope is prose
 * (`content`), not a list.
 */
export function effectiveOutputSchema(binding: {
  outputSchema?: ArenaGenerativeSchemaField[]
  outputSample?: string
  stream?: boolean
}): ArenaGenerativeSchemaField[] {
  const fromSample = schemaFromStoredSample(binding.outputSample, binding.stream === true)
  return unwrapHttpEnvelopeSchemaFields(namedSchemaFields(fromSample ?? binding.outputSchema))
}

/**
 * Layout-plan name for {@link effectiveOutputSchema}. Prompt and validate
 * already call this; runtime unwrap must use the same function.
 */
export function layoutOutputSchemaFromBinding(binding: {
  outputSchema?: ArenaGenerativeSchemaField[]
  outputSample?: string
  stream?: boolean
}): ArenaGenerativeSchemaField[] {
  return effectiveOutputSchema(binding)
}

function schemaFromStoredSample(
  sample: string | undefined,
  stream: boolean
): ArenaGenerativeSchemaField[] | undefined {
  const trimmed = sample?.trim()
  if (!trimmed) {
    return undefined
  }
  try {
    return outputLayoutFromSample(trimmed, { stream }).outputSchema
  } catch {
    return undefined
  }
}

/**
 * Drops Response-block envelope rows so layout plans bind the body. A string
 * `data` (or unwrapped `result`) is omitted — host prose uses `content`. An
 * object `output` envelope — top-level `{ output, input, email }` or
 * `result[].output` — is rewritten so a stored `output.coverage_report.summary`
 * becomes `coverage_report.summary` before generate copies host keys.
 */
export function unwrapHttpEnvelopeSchemaFields(
  schema: ArenaGenerativeSchemaField[]
): ArenaGenerativeSchemaField[] {
  const named = namedSchemaFields(schema)
  if (named.length === 0) {
    return []
  }
  if (isHttpEnvelopeOnlySchema(named)) {
    const dataType = named.find((field) => field.name === 'data')?.type
    if (!dataType || dataType === 'string') {
      return []
    }
    return rewriteOutputEnvelopes(
      named
        .filter(
          (field) =>
            field.name === 'data' || field.name.startsWith('data.') || field.name.startsWith('data[')
        )
        .map((field) => ({ ...field, name: renameDataEnvelopeRoot(field.name, dataType) }))
        .filter((field) => field.name.length > 0)
    )
  }
  if (named.length === 1 && named[0].name === 'result' && named[0].type === 'string') {
    return []
  }
  return rewriteOutputEnvelopes(named)
}

function isHttpEnvelopeOnlySchema(fields: Array<{ name: string }>): boolean {
  const topLevel = fields.filter((field) => !field.name.includes('.') && !field.name.includes('['))
  if (topLevel.length === 0 || !topLevel.some((field) => field.name === 'data')) {
    return false
  }
  return topLevel.every((field) => SAMPLE_ENVELOPE_KEYS.has(field.name))
}

function renameDataEnvelopeRoot(name: string, dataType: string): string {
  if (name === 'data') {
    return dataType === 'array' ? NON_OBJECT_ROOT_PATH : ''
  }
  if (name.startsWith('data.')) {
    return name.slice('data.'.length)
  }
  if (name.startsWith('data[]')) {
    return `${NON_OBJECT_ROOT_PATH}${name.slice('data'.length)}`
  }
  return name
}

/**
 * `depth` counts object levels only; the `[]` element hop is notation, not
 * nesting, so `articles[].title` stays at the same depth as `meta.total`.
 * Breadth-first so sibling keys of `coverage_report` are recorded before nested
 * columns from earlier objects consume the field budget.
 */
function collectFields(
  value: unknown,
  path: string,
  depth: number,
  fields: ArenaGenerativeSchemaField[]
): boolean {
  const queue: Array<{ value: unknown; path: string; depth: number }> = [{ value, path, depth }]
  let index = 0
  while (index < queue.length) {
    if (fields.length >= MAX_OUTPUT_SCHEMA_FIELDS) {
      return true
    }
    const current = queue[index]
    index += 1
    enqueueSchemaNode(current, fields, queue)
  }
  return false
}

function enqueueSchemaNode(
  current: { value: unknown; path: string; depth: number },
  fields: ArenaGenerativeSchemaField[],
  queue: Array<{ value: unknown; path: string; depth: number }>
): void {
  const { value, path, depth } = current
  if (path && isActionTelemetryRoot(path)) {
    return
  }
  if (fields.length >= MAX_OUTPUT_SCHEMA_FIELDS) {
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
    if (value.length > 0) {
      queue.push({
        value: unwrapPastedSample(representativeArrayItem(value)),
        path: `${path}[]`,
        depth,
      })
    }
    return
  }

  if (value && typeof value === 'object') {
    if (path && !path.endsWith('[]')) {
      fields.push({ name: path, type: 'object' })
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nestedPath = path ? `${path}.${key}` : key
      if (isActionTelemetryRoot(nestedPath)) continue
      queue.push({ value: nested, path: nestedPath, depth: depth + 1 })
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
  if (path && isActionTelemetryRoot(path)) {
    return
  }
  if (fields.length >= MAX_OUTPUT_SCHEMA_FIELDS) {
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
    if (fields.length >= MAX_OUTPUT_SCHEMA_FIELDS) return
    const nestedPath = `${path}.${key}`
    if (isActionTelemetryRoot(nestedPath)) continue
    if (Array.isArray(nested)) {
      fields.push({ name: nestedPath, type: 'array' })
    }
  }
}

function representativeArrayItem(items: unknown[]): unknown {
  const sampled = sampleArrayItems(items)
  const objects = sampled.filter(isPlainRecord)
  if (objects.length === 0) {
    return sampled[0]
  }
  let merged: Record<string, unknown> = {}
  for (const object of objects) {
    merged = mergeSchemaObjects(merged, object)
  }
  return merged
}

function sampleArrayItems(items: unknown[]): unknown[] {
  if (items.length <= MAX_ARRAY_ITEMS_SAMPLED) {
    return items
  }
  const half = MAX_ARRAY_ITEMS_SAMPLED / 2
  return [...items.slice(0, half), ...items.slice(-half)]
}

function mergeSchemaObjects(
  left: Record<string, unknown>,
  right: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...left }
  for (const [key, value] of Object.entries(right)) {
    if (!Object.hasOwn(merged, key)) {
      merged[key] = value
      continue
    }
    merged[key] = mergeSchemaValues(merged[key], value)
  }
  return merged
}

function mergeSchemaValues(left: unknown, right: unknown): unknown {
  if (isPlainRecord(left) && isPlainRecord(right)) {
    return mergeSchemaObjects(left, right)
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const item = representativeArrayItem([...sampleArrayItems(left), ...sampleArrayItems(right)])
    return item === undefined ? [] : [item]
  }
  if (isEmptySchemaValue(left) && !isEmptySchemaValue(right)) {
    return right
  }
  return left
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isEmptySchemaValue(value: unknown): boolean {
  if (value == null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (isPlainRecord(value)) return Object.keys(value).length === 0
  return false
}

function rewriteOutputEnvelopes(
  fields: ArenaGenerativeSchemaField[]
): ArenaGenerativeSchemaField[] {
  return rewriteTopLevelOutputEnvelope(rewriteArrayItemSingletonEnvelope(fields))
}

/**
 * `{ output: { coverage_report }, input, email }` last-run rows keep `output.`
 * in stored schemas. Lift those children so generate binds `coverage_report.summary`.
 */
function rewriteTopLevelOutputEnvelope(
  fields: ArenaGenerativeSchemaField[]
): ArenaGenerativeSchemaField[] {
  const outputRow = fields.find((field) => field.name === 'output')
  if (outputRow?.type === 'string') {
    return fields
  }
  const hasChildren = fields.some(
    (field) => field.name.startsWith('output.') || field.name.startsWith('output[')
  )
  if (!hasChildren) {
    return fields
  }
  const kept: ArenaGenerativeSchemaField[] = []
  const seen = new Set<string>()
  for (const field of fields) {
    if (field.name === 'output' || field.name.startsWith('output.') || field.name.startsWith('output[')) {
      continue
    }
    if (seen.has(field.name)) continue
    seen.add(field.name)
    kept.push(field)
  }
  for (const field of fields) {
    if (field.name === 'output') continue
    let name = field.name
    if (name.startsWith('output.')) {
      name = name.slice('output.'.length)
    } else if (name.startsWith('output[')) {
      name = `${NON_OBJECT_ROOT_PATH}${name.slice('output'.length)}`
    } else {
      continue
    }
    if (!name || seen.has(name)) continue
    seen.add(name)
    kept.push({ ...field, name })
  }
  return kept
}

/**
 * `{output: {coverage_report}}` on every array item is an envelope, not a
 * business key. Rewrite `result[].output.summary` to `result[].summary` so
 * generate binds `coverage_report.summary` instead of `output.coverage_report.summary`.
 */
function rewriteArrayItemSingletonEnvelope(
  fields: ArenaGenerativeSchemaField[]
): ArenaGenerativeSchemaField[] {
  const arrayPaths = fields
    .filter((field) => field.type === 'array' && !field.name.includes('[]'))
    .map((field) => field.name)
  let next = fields
  for (const arrayPath of arrayPaths) {
    const itemPrefix = `${arrayPath}[]`
    const outputObject = `${itemPrefix}.output`
    const itemFields = next.filter(
      (field) =>
        field.name === itemPrefix ||
        field.name.startsWith(`${itemPrefix}.`) ||
        field.name.startsWith(`${itemPrefix}[`)
    )
    if (itemFields.length === 0) continue
    const hasOutputChildren = itemFields.some(
      (field) =>
        field.name.startsWith(`${outputObject}.`) || field.name.startsWith(`${outputObject}[`)
    )
    const outputRow = itemFields.find((field) => field.name === outputObject)
    if (!hasOutputChildren || outputRow?.type === 'string') continue
    const kept: ArenaGenerativeSchemaField[] = []
    const seen = new Set<string>()
    for (const field of next) {
      let name = field.name
      if (name === outputObject) continue
      if (name.startsWith(`${outputObject}.`)) {
        name = `${itemPrefix}.${name.slice(outputObject.length + 1)}`
      } else if (name.startsWith(`${outputObject}[`)) {
        name = `${itemPrefix}${name.slice(outputObject.length)}`
      }
      if (seen.has(name)) continue
      seen.add(name)
      kept.push(name === field.name ? field : { ...field, name })
    }
    next = kept
  }
  return next
}

function schemaTypeFromValue(value: unknown): string {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

/**
 * Nests schema fields under a Response/Builder path. `result` from an array
 * sample becomes the prefix itself (`history` + `result[].id` → `history[].id`).
 */
export function prefixOutputSchemaFields(
  fields: ArenaGenerativeSchemaField[],
  prefix: string
): ArenaGenerativeSchemaField[] {
  const named = namedSchemaFields(fields)
  const trimmed = prefix.trim()
  if (!trimmed) return named
  return named.map((field) => ({
    ...field,
    name: joinSchemaPath(trimmed, field.name),
  }))
}

function joinSchemaPath(prefix: string, child: string): string {
  const name = typeof child === 'string' ? child.trim() : ''
  if (!name || name === 'result') return prefix
  if (name.startsWith('result[]')) {
    return `${prefix}[]${name.slice('result[]'.length)}`
  }
  if (name.startsWith('result.')) {
    return `${prefix}.${name.slice('result.'.length)}`
  }
  return `${prefix}.${name}`
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
  const named = namedSchemaFields(schema)
  if (named.length === 0) return undefined
  const example: Record<string, unknown> = {}
  for (const field of named) {
    const type = typeof field.type === 'string' ? field.type.trim() : ''
    setExamplePath(example, field.name, type || 'string')
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
  if (typeof fieldName !== 'string') return ''
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
