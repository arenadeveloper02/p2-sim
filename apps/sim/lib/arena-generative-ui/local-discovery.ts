/**
 * Host-side search and filter for on-page collections when no discovery API
 * owns the field. SearchField / Filter controls without a known actionId
 * narrow Table and Repeat locally.
 */

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

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeDiscoveryKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '')
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
    search: searches.filter((value) => value.length > 0).join(' ').trim(),
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

export function filterStaticTableRows(
  headers: readonly string[],
  rows: readonly string[][],
  query: LocalDiscoveryQuery
): string[][] {
  if (!hasLocalDiscoveryQuery(query)) return rows.map((row) => [...row])
  return rows.filter((cells) => {
    const record: Record<string, unknown> = {}
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? ''
    })
    if (headers.length === 0) {
      return itemMatchesLocalDiscovery(cells.join(' '), query)
    }
    return itemMatchesLocalDiscovery(record, query)
  })
}
