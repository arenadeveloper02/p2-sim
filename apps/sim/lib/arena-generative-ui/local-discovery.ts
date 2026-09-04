/**
 * Host-side search and filter for on-page collections when no discovery API
 * owns the field. SearchField / Filter controls without a known actionId
 * narrow Table and Repeat locally.
 */

import { generateId } from '@sim/utils/id'
import {
  ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_KEY,
  ARENA_GENERATIVE_CHAT_TURNS_KEY,
  ARENA_GENERATIVE_DELETED_KEY,
  ARENA_GENERATIVE_ERROR_KEY,
  ARENA_GENERATIVE_INPUTS_KEY,
  ARENA_GENERATIVE_SCHEMA_WARNING_KEY,
  ARENA_GENERATIVE_SELECTED_ID_KEY,
  ARENA_GENERATIVE_SELECTED_KEY,
  ARENA_GENERATIVE_STREAM_CONTENT_KEY,
} from '@/lib/arena-generative-ui/types'

export interface LocalDiscoveryQuery {
  search: string
  filters: Record<string, string | readonly string[]>
}

interface SpecElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

const FILTER_FIELD_TYPES = new Set([
  'Select',
  'TextInput',
  'DateInput',
  'MultiSelect',
  'RadioGroup',
  'NumberInput',
])

const FILTER_PARENT_TYPES = new Set(['Filter', 'Toolbar'])

const SEARCH_KEY_ALIASES = new Set(['query', 'q', 'search', 'term'])

const IGNORED_FILTER_KEYS = new Set(['sort', 'order', 'orderby', 'direction'])

const ITEM_IDENTITY_KEYS = new Set(['id', 'key', 'slug'])

const SELECTED_ROW_PATCH_SKIP = new Set([
  ARENA_GENERATIVE_CHAT_TURNS_KEY,
  ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_KEY,
  ARENA_GENERATIVE_STREAM_CONTENT_KEY,
  ARENA_GENERATIVE_ERROR_KEY,
  ARENA_GENERATIVE_SCHEMA_WARNING_KEY,
  ARENA_GENERATIVE_INPUTS_KEY,
  ARENA_GENERATIVE_SELECTED_KEY,
  ARENA_GENERATIVE_SELECTED_ID_KEY,
  ARENA_GENERATIVE_DELETED_KEY,
  'creating',
  'editing',
  'index',
  'hasMore',
  'nextCursor',
  'offset',
  'input',
  'conversationId',
  'files',
])

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeDiscoveryKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

/** Empty, placeholder, or "All / All Categories" options do not constrain the collection. */
export function isLocalDiscoveryPassthrough(value: unknown): boolean {
  if (value == null) return true
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((item) => isLocalDiscoveryPassthrough(item))
  }
  const text = String(value).trim()
  if (!text) return true
  return /^(all|any|select)(\s+.+)?$/i.test(text)
}

export function hasLocalDiscoveryQuery(query: LocalDiscoveryQuery): boolean {
  if (query.search.trim().length > 0) return true
  return Object.keys(query.filters).length > 0
}

/**
 * Action ids the host can actually run. A SearchField or Filter field whose
 * actionId is in this set is API-owned and must not also filter locally.
 */
export function collectKnownActionIds(
  ...sources: Array<Record<string, unknown> | undefined>
): Set<string> {
  const ids = new Set<string>()
  for (const source of sources) {
    if (!source) continue
    for (const key of Object.keys(source)) {
      if (key) ids.add(key)
    }
  }
  return ids
}

function parseChipSetValue(raw: string): { name: string | null; value: string } {
  const separator = raw.indexOf('=')
  if (separator > 0) {
    return { name: raw.slice(0, separator).trim(), value: raw.slice(separator + 1) }
  }
  return { name: null, value: raw }
}

function walk(
  elements: Record<string, SpecElement>,
  ids: readonly string[],
  visit: (id: string, element: SpecElement) => void
) {
  for (const id of ids) {
    const element = elements[id]
    if (!element) continue
    visit(id, element)
    walk(elements, element.children ?? [], visit)
  }
}

function addFilterValue(
  filters: Record<string, string | readonly string[]>,
  name: string,
  value: unknown
) {
  const key = name.trim()
  if (!key) return
  if (IGNORED_FILTER_KEYS.has(normalizeDiscoveryKey(key))) return
  if (SEARCH_KEY_ALIASES.has(normalizeDiscoveryKey(key))) return
  if (isLocalDiscoveryPassthrough(value)) return
  if (Array.isArray(value)) {
    const selected = value.map((item) => String(item).trim()).filter((item) => item.length > 0)
    if (selected.length === 0) return
    filters[key] = selected
    return
  }
  const text = String(value).trim()
  if (!text) return
  filters[key] = text
}

/**
 * Builds the local query from page form values. SearchFields and Filter /
 * Toolbar fields with a known actionId are skipped so an API CTA owns them.
 */
export function collectLocalDiscoveryQuery(options: {
  formValues: Record<string, unknown>
  elements: Record<string, SpecElement>
  knownActionIds?: ReadonlySet<string>
}): LocalDiscoveryQuery {
  const known = options.knownActionIds ?? new Set<string>()
  const searches: string[] = []
  const filters: Record<string, string | readonly string[]> = {}

  const visitField = (element: SpecElement, underFilterChrome: boolean) => {
    const props = element.props ?? {}
    const actionId = asString(props.actionId)
    if (actionId && known.has(actionId)) return
    const name = asString(props.name, element.type === 'SearchField' ? 'query' : '')

    if (element.type === 'SearchField') {
      const value = options.formValues[name]
      if (!isLocalDiscoveryPassthrough(value)) {
        searches.push(String(value).trim())
      }
      return
    }

    if (!underFilterChrome || !FILTER_FIELD_TYPES.has(element.type ?? '')) return
    if (SEARCH_KEY_ALIASES.has(normalizeDiscoveryKey(name))) {
      const value = options.formValues[name]
      if (!isLocalDiscoveryPassthrough(value)) searches.push(String(value).trim())
      return
    }
    addFilterValue(filters, name, options.formValues[name])
  }

  for (const element of Object.values(options.elements)) {
    if (element.type === 'SearchField') visitField(element, false)
  }

  for (const element of Object.values(options.elements)) {
    if (!FILTER_PARENT_TYPES.has(element.type ?? '')) continue
    walk(options.elements, element.children ?? [], (_childId, child) => {
      if (child.type === 'SearchField') return
      if (child.type === 'Chip') {
        const actionId = asString(child.props?.actionId)
        if (actionId && known.has(actionId)) return
        const parsed = parseChipSetValue(asString(child.props?.setValue))
        const name = parsed.name
        if (!name) return
        addFilterValue(filters, name, options.formValues[name])
        return
      }
      visitField(child, true)
    })
  }

  return {
    search: searches
      .filter((value) => value.length > 0)
      .join(' ')
      .trim(),
    filters,
  }
}

function primitiveStrings(value: unknown, depth = 0): string[] {
  if (value == null) return []
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)]
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => primitiveStrings(item, depth))
  }
  if (typeof value === 'object' && depth < 1) {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      primitiveStrings(item, depth + 1)
    )
  }
  return []
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function valueForFilterKey(record: Record<string, unknown>, filterName: string): unknown {
  const want = normalizeDiscoveryKey(filterName)
  if (!want) return undefined
  if (filterName in record) return record[filterName]
  for (const [key, value] of Object.entries(record)) {
    if (normalizeDiscoveryKey(key) === want) return value
  }
  return undefined
}

function valuesMatchFilter(actual: unknown, expected: string | readonly string[]): boolean {
  const actuals = primitiveStrings(actual).map((item) => item.trim().toLowerCase())
  if (actuals.length === 0) return false
  if (Array.isArray(expected)) {
    const wanted = expected.map((item) => item.trim().toLowerCase()).filter(Boolean)
    return wanted.some((item) => actuals.includes(item))
  }
  const want = expected.trim().toLowerCase()
  return actuals.includes(want)
}

/** True when one collection item (or static table row-as-record) matches the query. */
export function itemMatchesLocalDiscovery(item: unknown, query: LocalDiscoveryQuery): boolean {
  const search = query.search.trim().toLowerCase()
  if (search) {
    const haystack = primitiveStrings(item).join(' ').toLowerCase()
    if (!haystack.includes(search)) return false
  }
  const record = recordFromUnknown(item)
  for (const [name, expected] of Object.entries(query.filters)) {
    if (!record) return false
    const actual = valueForFilterKey(record, name)
    if (actual === undefined) continue
    if (!valuesMatchFilter(actual, expected)) return false
  }
  return true
}

export function filterCollectionItems<T>(items: readonly T[], query: LocalDiscoveryQuery): T[] {
  if (!hasLocalDiscoveryQuery(query)) return [...items]
  return items.filter((item) => itemMatchesLocalDiscovery(item, query))
}

function itemIdentityId(item: unknown): string {
  const record = recordFromUnknown(item)
  if (!record) return ''
  for (const field of ['id', 'key', 'slug'] as const) {
    const value = valueForFilterKey(record, field)
    if (typeof value === 'string' && value) return value
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function isForeignKeyName(name: string): boolean {
  const norm = normalizeDiscoveryKey(name)
  if (!norm || ITEM_IDENTITY_KEYS.has(norm)) return false
  return /(?:id|key|slug)$/.test(norm)
}

function collectionHasForeignKeys(items: readonly unknown[]): boolean {
  return items.some((item) => {
    const record = recordFromUnknown(item)
    if (!record) return false
    return Object.keys(record).some((key) => isForeignKeyName(key))
  })
}

function foreignKeyValues(item: unknown): string[] {
  const record = recordFromUnknown(item)
  if (!record) return []
  const values: string[] = []
  for (const [key, value] of Object.entries(record)) {
    if (!isForeignKeyName(key)) continue
    for (const part of primitiveStrings(value)) {
      const trimmed = part.trim()
      if (trimmed) values.push(trimmed)
    }
  }
  return values
}

function itemMatchesSelectionAnchors(item: unknown, anchors: readonly string[]): boolean {
  const record = recordFromUnknown(item)
  if (!record || anchors.length === 0) return false
  return Object.entries(record).some(
    ([key, value]) =>
      isForeignKeyName(key) && anchors.some((anchor) => valuesMatchFilter(value, anchor))
  )
}

function selectionAnchorIds(selectedId: string, selected: unknown): string[] {
  const anchors: string[] = []
  if (selectedId) anchors.push(selectedId)
  const identity = itemIdentityId(selected)
  if (identity && !anchors.includes(identity)) anchors.push(identity)
  for (const value of foreignKeyValues(selected)) {
    if (!anchors.some((anchor) => anchor.toLowerCase() === value.toLowerCase())) {
      anchors.push(value)
    }
  }
  return anchors
}

/**
 * Workspace selection: the root list (selected row has no foreign key) stays
 * intact. A child list stays narrowed to the parent after a second click —
 * siblings share the selected row's projectId, or point at selected / selectedId.
 * No-op when nothing is selected or the collection has no FK-shaped fields.
 */
export function filterCollectionItemsBySelection<T>(
  items: readonly T[],
  selectedId: unknown,
  selected?: unknown
): T[] {
  const id =
    typeof selectedId === 'string'
      ? selectedId.trim()
      : selectedId == null
        ? ''
        : String(selectedId).trim()
  if (!id || items.length === 0) return [...items]
  const selectedRow = items.find((item) => itemIdentityId(item) === id)
  if (selectedRow) {
    const parentIds = foreignKeyValues(selectedRow)
    if (parentIds.length === 0) return [...items]
    return items.filter((item) => itemMatchesSelectionAnchors(item, parentIds))
  }
  if (!collectionHasForeignKeys(items)) return [...items]
  return items.filter((item) =>
    itemMatchesSelectionAnchors(item, selectionAnchorIds(id, selected))
  )
}

function inferForeignKeyName(items: readonly unknown[]): string | undefined {
  for (const item of items) {
    const record = recordFromUnknown(item)
    if (!record) continue
    const key = Object.keys(record).find((name) => isForeignKeyName(name))
    if (key) return key
  }
  return undefined
}

function isEntityRecord(item: unknown): boolean {
  const record = recordFromUnknown(item)
  if (!record) return false
  if (itemIdentityId(record)) return true
  return (
    valueForFilterKey(record, 'name') !== undefined ||
    valueForFilterKey(record, 'title') !== undefined
  )
}

function preferredIdentityKey(items: readonly unknown[]): string {
  for (const field of ['id', 'key', 'slug'] as const) {
    for (const item of items) {
      const record = recordFromUnknown(item)
      if (!record) continue
      if (field in record) return field
      for (const key of Object.keys(record)) {
        if (normalizeDiscoveryKey(key) === field) return key
      }
    }
  }
  return 'id'
}

/**
 * Dummy create often omits `id`. Assign one so complete/delete/select can
 * target the new row. Reuses an existing `Id` header when the collection
 * was seeded from Table.rows.
 */
export function ensureCollectionItemIds<T>(items: readonly T[]): T[] {
  const key = preferredIdentityKey(items)
  return items.map((item) => {
    if (!isEntityRecord(item) || itemIdentityId(item)) return item
    const record = recordFromUnknown(item)
    if (!record) return item
    return { ...record, [key]: generateId() } as T
  })
}

/**
 * Dummy/local create onto a filtered child collection. Stamps the selected
 * parent id onto incoming rows that are missing the foreign key so the new
 * row stays visible. Leaves the root list and Chat turns alone.
 */
export function stampSelectionForeignKeys<T>(
  incoming: readonly T[],
  existing: readonly unknown[],
  selectedId: unknown,
  selected?: unknown
): T[] {
  const id =
    typeof selectedId === 'string'
      ? selectedId.trim()
      : selectedId == null
        ? ''
        : String(selectedId).trim()
  if (!id || incoming.length === 0) return [...incoming]
  if (!incoming.some((item) => isEntityRecord(item))) return [...incoming]
  const sourceItem =
    existing.find((item) => itemIdentityId(item) === id) ??
    incoming.find((item) => itemIdentityId(item) === id)
  if (sourceItem && foreignKeyValues(sourceItem).length === 0) return [...incoming]
  const fkName =
    inferForeignKeyName(existing) ?? inferForeignKeyName(incoming) ?? 'projectId'
  const selectedInExisting = existing.some((item) => itemIdentityId(item) === id)
  const parentId = selectedInExisting
    ? foreignKeyValues(sourceItem ?? selected)[0]
    : foreignKeyValues(selected)[0] || id
  if (!parentId) return [...incoming]
  return incoming.map((item) => {
    const record = recordFromUnknown(item)
    if (!record || !isEntityRecord(record)) return item
    const current = valueForFilterKey(record, fkName)
    if (current !== undefined && String(current).trim() !== '') return item
    return { ...record, [fkName]: parentId }
  })
}

function recordsFromStaticTableRows(
  headers: readonly string[],
  rows: readonly string[][]
): Array<Record<string, unknown>> {
  return rows.map((cells) => {
    const record: Record<string, unknown> = {}
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? ''
    })
    return record
  })
}

const SIMPLE_HOST_STATE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Host key for the only Table that has rows and no authored `statePath`. */
export const IMPLICIT_DUMMY_TABLE_STATE_PATH = 'rows'

function simpleCollectionStatePath(element: SpecElement): string {
  if (element.type !== 'Repeat' && element.type !== 'Table') return ''
  const key = asString(element.props?.statePath).trim()
  return SIMPLE_HOST_STATE_KEY.test(key) ? key : ''
}

function authoredCollectionStatePaths(spec: {
  elements?: Record<string, SpecElement>
}): string[] {
  const keys: string[] = []
  for (const element of Object.values(spec.elements ?? {})) {
    const key = simpleCollectionStatePath(element)
    if (key) keys.push(key)
  }
  return keys
}

function isUnpathedTableWithRows(element: SpecElement): boolean {
  if (element.type !== 'Table') return false
  if (simpleCollectionStatePath(element)) return false
  return parseStaticTableCollection(element.props?.columns, element.props?.rows).length > 0
}

/**
 * Parses dummy `Table.columns` / `Table.rows` (`Name, Role` + `Ada | Engineer`).
 */
export function parseStaticTableCollection(
  columns: unknown,
  rows: unknown
): Array<Record<string, unknown>> {
  const headers = asString(columns)
    .split(',')
    .map((header) => header.trim())
    .filter(Boolean)
  if (headers.length === 0) return []
  const lines = asString(rows)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('|').map((cell) => cell.trim()))
  if (lines.length === 0) return []
  return recordsFromStaticTableRows(headers, lines)
}

/**
 * Host-state arrays authored as `Table.rows` on a matching `statePath`.
 * A sole Table with rows and no path seeds {@link IMPLICIT_DUMMY_TABLE_STATE_PATH}.
 * Does not invent rows for a Repeat that has no table seed.
 */
export function dummyCollectionSeedFromSpec(spec: {
  elements?: Record<string, SpecElement>
}): Record<string, unknown[]> {
  const seed: Record<string, unknown[]> = {}
  const unpathed: SpecElement[] = []
  for (const element of Object.values(spec.elements ?? {})) {
    if (element.type !== 'Table') continue
    const records = parseStaticTableCollection(element.props?.columns, element.props?.rows)
    if (records.length === 0) continue
    const key = simpleCollectionStatePath(element)
    if (key) {
      seed[key] = records
      continue
    }
    unpathed.push(element)
  }
  if (unpathed.length === 1) {
    seed[IMPLICIT_DUMMY_TABLE_STATE_PATH] = parseStaticTableCollection(
      unpathed[0].props?.columns,
      unpathed[0].props?.rows
    )
  }
  return seed
}

/** Implicit host keys for a sole Table that authored rows but no `statePath`. */
export function implicitDummyTableKeysFromSpec(spec: {
  elements?: Record<string, SpecElement>
}): string[] {
  const unpathed = Object.values(spec.elements ?? {}).filter((element) =>
    isUnpathedTableWithRows(element)
  )
  return unpathed.length === 1 ? [IMPLICIT_DUMMY_TABLE_STATE_PATH] : []
}

/** Union of implicit Table keys across every page spec. */
export function implicitDummyTableKeysFromManifest(manifest: {
  pages?: Record<string, { spec?: { elements?: Record<string, SpecElement> } }>
}): string[] {
  const keys = new Set<string>()
  for (const page of Object.values(manifest.pages ?? {})) {
    for (const key of implicitDummyTableKeysFromSpec(page.spec ?? {})) keys.add(key)
  }
  return [...keys]
}

/**
 * Binds a Table that authored rows but no `statePath` to the implicit host key.
 * Empty when more than one Table is unpathed.
 */
export function implicitDummyTableStatePath(
  spec: { elements?: Record<string, SpecElement> },
  elementId: string
): string {
  const element = spec.elements?.[elementId]
  if (!element || !isUnpathedTableWithRows(element)) return ''
  return implicitDummyTableKeysFromSpec(spec)[0] ?? ''
}

/** Collection host keys the spec can mutate (authored paths plus Table seeds). */
export function dummyCollectionKeysFromSpec(spec: {
  elements?: Record<string, SpecElement>
}): string[] {
  return [
    ...new Set([
      ...authoredCollectionStatePaths(spec),
      ...Object.keys(dummyCollectionSeedFromSpec(spec)),
    ]),
  ]
}

/** Union of collection keys across every page spec. */
export function dummyCollectionKeysFromManifest(manifest: {
  pages?: Record<string, { spec?: { elements?: Record<string, SpecElement> } }>
}): string[] {
  const keys = new Set<string>()
  for (const page of Object.values(manifest.pages ?? {})) {
    for (const key of dummyCollectionKeysFromSpec(page.spec ?? {})) keys.add(key)
  }
  return [...keys]
}

/**
 * Patch of seed keys missing from host state. Empty arrays already written by
 * onLoad stay empty — this does not overwrite.
 */
export function fillMissingHostCollections(
  current: Record<string, unknown>,
  seed: Record<string, unknown>
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(seed)) {
    if (!Array.isArray(value) || value.length === 0) continue
    if (current[key] !== undefined) continue
    patch[key] = value
  }
  return Object.keys(patch).length === 0 ? null : patch
}

/** Fills missing collection keys from `Table.rows` so Repeat/Table share one array. */
export function withDummyCollectionSeed(
  current: Record<string, unknown>,
  spec: { elements?: Record<string, { type?: string; props?: Record<string, unknown> }> }
): Record<string, unknown> {
  const patch = fillMissingHostCollections(current, dummyCollectionSeedFromSpec(spec))
  return patch ? { ...current, ...patch } : current
}

export function filterStaticTableRows(
  headers: readonly string[],
  rows: readonly string[][],
  query: LocalDiscoveryQuery
): string[][] {
  if (!hasLocalDiscoveryQuery(query)) return rows.map((row) => [...row])
  return rows.filter((cells) => {
    if (headers.length === 0) {
      return itemMatchesLocalDiscovery(cells.join(' '), query)
    }
    const record: Record<string, unknown> = {}
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? ''
    })
    return itemMatchesLocalDiscovery(record, query)
  })
}

/**
 * Same Workspace selection rule as {@link filterCollectionItemsBySelection},
 * for dummy Table.rows keyed by header names (Id, Project Id).
 */
export function filterStaticTableRowsBySelection(
  headers: readonly string[],
  rows: readonly string[][],
  selectedId: unknown,
  selected?: unknown
): string[][] {
  if (headers.length === 0 || rows.length === 0) {
    return rows.map((row) => [...row])
  }
  const items = recordsFromStaticTableRows(headers, rows)
  const filtered = filterCollectionItemsBySelection(items, selectedId, selected)
  return filtered.map((record) =>
    headers.map((header) => String((record as Record<string, unknown>)[header] ?? ''))
  )
}

/**
 * Dummy delete signals `{ deleted: true }` instead of rewriting the collection.
 * Remove the selected row, drop selection, and strip the sentinel.
 */
export function applySelectedRowDelete(
  next: Record<string, unknown>,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): boolean {
  if (patch[ARENA_GENERATIVE_DELETED_KEY] !== true) return false
  delete next[ARENA_GENERATIVE_DELETED_KEY]
  const selectedId =
    typeof current[ARENA_GENERATIVE_SELECTED_ID_KEY] === 'string'
      ? (current[ARENA_GENERATIVE_SELECTED_ID_KEY] as string).trim()
      : ''
  const id = itemIdentityId(patch) || selectedId
  if (id) {
    for (const [key, value] of Object.entries(next)) {
      if (!Array.isArray(value) || key === ARENA_GENERATIVE_CHAT_TURNS_KEY) continue
      const filtered = value.filter((item) => itemIdentityId(item) !== id)
      if (filtered.length !== value.length) next[key] = filtered
    }
  }
  const selected = recordFromUnknown(next[ARENA_GENERATIVE_SELECTED_KEY])
  if (!selected || itemIdentityId(selected) === id) {
    delete next[ARENA_GENERATIVE_SELECTED_KEY]
    delete next[ARENA_GENERATIVE_SELECTED_ID_KEY]
    delete next[ARENA_GENERATIVE_STREAM_CONTENT_KEY]
  }
  return true
}

function patchWritesCollection(patch: Record<string, unknown>): boolean {
  return Object.entries(patch).some(
    ([key, value]) => key !== ARENA_GENERATIVE_CHAT_TURNS_KEY && Array.isArray(value)
  )
}

function selectedRowFieldPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (SELECTED_ROW_PATCH_SKIP.has(key)) continue
    if (value === undefined || Array.isArray(value)) continue
    fields[key] = value
  }
  return fields
}

/**
 * Dummy complete/edit often writes scalars (`done: true`) instead of updating
 * the collection. Copy those fields onto `selected` and the matching row.
 */
export function applySelectedRowFields(
  next: Record<string, unknown>,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): void {
  const selectedId =
    typeof current[ARENA_GENERATIVE_SELECTED_ID_KEY] === 'string'
      ? (current[ARENA_GENERATIVE_SELECTED_ID_KEY] as string).trim()
      : ''
  const id = itemIdentityId(patch) || selectedId
  if (!id) return
  if (patchWritesCollection(patch)) return
  if (
    Object.prototype.hasOwnProperty.call(patch, 'creating') &&
    !Object.prototype.hasOwnProperty.call(patch, 'editing')
  ) {
    return
  }
  const fields = selectedRowFieldPatch(patch)
  if (Object.keys(fields).length === 0) return
  const selected = recordFromUnknown(next[ARENA_GENERATIVE_SELECTED_KEY])
  if (selected && itemIdentityId(selected) === id) {
    next[ARENA_GENERATIVE_SELECTED_KEY] = { ...selected, ...fields }
  }
  for (const [key, value] of Object.entries(next)) {
    if (!Array.isArray(value) || key === ARENA_GENERATIVE_CHAT_TURNS_KEY) continue
    if (Object.prototype.hasOwnProperty.call(patch, key)) continue
    let changed = false
    const updated = value.map((item) => {
      if (itemIdentityId(item) !== id) return item
      const record = recordFromUnknown(item)
      if (!record) return item
      changed = true
      return { ...record, ...fields }
    })
    if (changed) next[key] = updated
  }
}

/** True when incoming rows already appear in the collection (a full replace). */
export function collectionIdentitiesOverlap(
  existing: readonly unknown[],
  incoming: readonly unknown[]
): boolean {
  const existingIds = new Set(existing.map((item) => itemIdentityId(item)).filter(Boolean))
  if (existingIds.size === 0) return false
  return incoming.some((item) => {
    const id = itemIdentityId(item)
    return Boolean(id) && existingIds.has(id)
  })
}

/** Rows shown per Table/Repeat page when the binding has no pagination API. */
export const LOCAL_COLLECTION_PAGE_SIZE = 20

export interface PaginatedCollection<T> {
  items: T[]
  page: number
  pageCount: number
  total: number
  from: number
  to: number
}

/**
 * One page of an already-loaded collection. Out-of-range `page` clamps.
 */
export function paginateCollection<T>(
  items: readonly T[],
  page: number,
  pageSize = LOCAL_COLLECTION_PAGE_SIZE
): PaginatedCollection<T> {
  const total = items.length
  const size = pageSize > 0 ? Math.trunc(pageSize) : LOCAL_COLLECTION_PAGE_SIZE
  const pageCount = Math.max(1, Math.ceil(total / size) || 1)
  const safePage = Number.isFinite(page) ? Math.min(Math.max(Math.trunc(page), 1), pageCount) : 1
  const start = total === 0 ? 0 : (safePage - 1) * size
  const sliced = items.slice(start, start + size)
  return {
    items: sliced,
    page: safePage,
    pageCount,
    total,
    from: sliced.length === 0 ? 0 : start + 1,
    to: start + sliced.length,
  }
}
