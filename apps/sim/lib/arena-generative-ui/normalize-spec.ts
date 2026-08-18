import type { Spec } from '@json-render/core'

/**
 * Element shape as it arrives from the model: `children` may be a nested array
 * of objects, and a `data` sibling may carry the values that belong in `props`.
 */
interface LooseElement {
  type?: unknown
  props?: unknown
  children?: unknown
  data?: unknown
}

interface FlatElement {
  type: string
  props: Record<string, unknown>
  children: string[]
}

type ElementMap = Record<string, FlatElement>

/**
 * Component names models reach for that map cleanly onto a catalog type. Keeping
 * these as aliases rather than catalog entries avoids a second way to express
 * the same chrome.
 */
const TYPE_ALIASES: Record<string, string> = {
  Box: 'Stack',
  CheckBox: 'Checkbox',
  CheckboxField: 'Checkbox',
  Collection: 'Repeat',
  Container: 'Stack',
  Date: 'DateInput',
  DateField: 'DateInput',
  DatePicker: 'DateInput',
  Dropdown: 'Select',
  ForEach: 'Repeat',
  Input: 'TextInput',
  InputField: 'TextInput',
  KPI: 'Stat',
  Loader: 'Skeleton',
  Loading: 'Skeleton',
  Metric: 'Stat',
  MultiSelectField: 'MultiSelect',
  Number: 'NumberInput',
  NumberField: 'NumberInput',
  NumericInput: 'NumberInput',
  Paragraph: 'Text',
  Radio: 'RadioGroup',
  RadioButtons: 'RadioGroup',
  SelectField: 'Select',
  SwitchField: 'Switch',
  TagSelect: 'MultiSelect',
  Textarea: 'TextArea',
  TextareaField: 'TextArea',
  Toggle: 'Switch',
  ToggleSwitch: 'Switch',
}

/**
 * Spacing tokens type-check as `z.string()` but land in inline styles, where an
 * unresolved token silently collapses the gap. Resolve them to real lengths.
 */
const SPACING_TOKENS: Record<string, string> = {
  none: '0px',
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
}

const SPACING_PROPS = ['gap', 'padding'] as const

/**
 * CSS flexbox spellings the model reaches for. The renderer only maps the catalog enum, so an
 * unmapped near-miss silently drops the requested layout instead of failing loudly.
 */
const JUSTIFY_ALIASES: Record<string, string> = {
  'space-between': 'between',
  space_between: 'between',
  spacebetween: 'between',
  'flex-start': 'start',
  left: 'start',
  'flex-end': 'end',
  right: 'end',
  centre: 'center',
  middle: 'center',
}

const ALIGN_ALIASES: Record<string, string> = {
  'flex-start': 'start',
  top: 'start',
  left: 'start',
  'flex-end': 'end',
  bottom: 'end',
  right: 'end',
  centre: 'center',
  middle: 'center',
  baseline: 'start',
  fill: 'stretch',
}

/** Types whose primary text may arrive as `content` instead of `text`. */
const CONTENT_TEXT_TYPES = new Set(['Text', 'Alert', 'ListItem', 'Heading'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Only writes when the value actually changes, so untouched specs stay identical. */
function setProp(props: Record<string, unknown>, key: string, next: unknown): void {
  if (props[key] !== next) {
    props[key] = next
  }
}

/** Drops a consumed shorthand without introducing the key on elements that lacked it. */
function clearProp(props: Record<string, unknown>, key: string): void {
  if (key in props) {
    props[key] = undefined
  }
}

function createIdFactory(taken: Set<string>): () => string {
  let counter = 0
  return () => {
    counter += 1
    let id = `n${counter}`
    while (taken.has(id)) {
      counter += 1
      id = `n${counter}`
    }
    taken.add(id)
    return id
  }
}

/**
 * Normalizes a generated page spec into the flat `{ root, elements }` shape the
 * catalog validates: flattens nested children, resolves component aliases,
 * repairs props, and guarantees a `Page` root. Unknown component types are left
 * untouched so validation still reports them instead of dropping content.
 */
export function normalizeGeneratedSpec(raw: unknown): Spec | null {
  if (!isRecord(raw)) {
    return null
  }
  const source = structuredClone(raw) as Record<string, unknown>
  const rawElements = isRecord(source.elements) ? source.elements : null
  const elements: ElementMap = {}
  const nextId = createIdFactory(new Set(rawElements ? Object.keys(rawElements) : []))

  let root = ''
  if (rawElements) {
    for (const [key, value] of Object.entries(rawElements)) {
      if (!isRecord(value)) continue
      elements[key] = normalizeElement(value, elements, nextId)
    }
    root = asString(source.root)
    if (!root || !elements[root]) {
      root = pickRoot(elements)
    }
  } else if (asString(source.type)) {
    root = flattenNode(source, elements, nextId)
  }

  if (!root || !elements[root]) {
    return null
  }
  return { root: ensurePageRoot(root, elements, nextId), elements } as Spec
}

function pickRoot(elements: ElementMap): string {
  const keys = Object.keys(elements)
  return keys.find((key) => elements[key].type === 'Page') ?? keys[0] ?? ''
}

/**
 * Wraps a non-`Page` root so every spec satisfies the Page-root rule. A bare
 * `Section` only needs the `Page`; anything else also gains a `Section` so the
 * content keeps its gutters and width cap.
 */
function ensurePageRoot(root: string, elements: ElementMap, nextId: () => string): string {
  const rootType = elements[root].type
  if (rootType === 'Page') {
    return root
  }
  let inner = root
  if (rootType !== 'Section') {
    const sectionId = nextId()
    elements[sectionId] = {
      type: 'Section',
      props: { width: 'wide' },
      children: [inner],
    }
    inner = sectionId
  }
  const pageId = nextId()
  elements[pageId] = { type: 'Page', props: {}, children: [inner] }
  return pageId
}

function flattenNode(
  node: Record<string, unknown>,
  elements: ElementMap,
  nextId: () => string
): string {
  const id = nextId()
  elements[id] = { type: '', props: {}, children: [] }
  elements[id] = normalizeElement(node, elements, nextId)
  return id
}

function normalizeElement(
  raw: LooseElement,
  elements: ElementMap,
  nextId: () => string
): FlatElement {
  const type = resolveType(asString(raw.type))
  const props = normalizeProps(type, isRecord(raw.props) ? { ...raw.props } : {}, raw.data)
  const children = normalizeChildren(raw.children, elements, nextId)
  appendSynthesizedChildren(type, props, children, elements, nextId)
  return { type, props, children }
}

function resolveType(type: string): string {
  return TYPE_ALIASES[type] ?? type
}

function normalizeChildren(raw: unknown, elements: ElementMap, nextId: () => string): string[] {
  if (typeof raw === 'string') {
    const id = raw.trim()
    return id ? [id] : []
  }
  if (isRecord(raw)) {
    return [flattenNode(raw, elements, nextId)]
  }
  if (!Array.isArray(raw)) {
    return []
  }
  const children: string[] = []
  for (const child of raw) {
    if (typeof child === 'string') {
      const id = child.trim()
      if (id) children.push(id)
      continue
    }
    if (isRecord(child)) {
      children.push(flattenNode(child, elements, nextId))
    }
  }
  return children
}

/**
 * `Form.submitLabel` is a shorthand models borrow from other design systems.
 * Turn it into the explicit `SubmitButton` child the renderer needs.
 */
function appendSynthesizedChildren(
  type: string,
  props: Record<string, unknown>,
  children: string[],
  elements: ElementMap,
  nextId: () => string
): void {
  if (type !== 'Form') {
    return
  }
  const submitLabel = asString(props.submitLabel)
  clearProp(props, 'submitLabel')
  if (!submitLabel) {
    return
  }
  const hasSubmit = children.some((childId) => elements[childId]?.type === 'SubmitButton')
  if (hasSubmit) {
    return
  }
  const id = nextId()
  elements[id] = { type: 'SubmitButton', props: { label: submitLabel }, children: [] }
  children.push(id)
}

function normalizeProps(
  type: string,
  props: Record<string, unknown>,
  data: unknown
): Record<string, unknown> {
  hoistData(props, data)
  if (CONTENT_TEXT_TYPES.has(type) && props.text === undefined) {
    const content = asString(props.content)
    if (content) {
      props.text = content
      clearProp(props, 'content')
    }
  }
  normalizeDirection(props)
  normalizeLayoutValues(props)
  normalizeSpacing(props)
  normalizeTypeProps(type, props)
  return props
}

/**
 * Models often split values into a sibling `data` object. Fold it into props
 * without overwriting anything explicitly set there.
 */
function hoistData(props: Record<string, unknown>, data: unknown): void {
  if (!isRecord(data)) {
    return
  }
  for (const [key, value] of Object.entries(data)) {
    if (key === 'trend') {
      hoistTrend(props, value)
      continue
    }
    if (props[key] === undefined) {
      props[key] = value
    }
  }
}

function hoistTrend(props: Record<string, unknown>, trend: unknown): void {
  if (typeof trend === 'string') {
    if (props.delta === undefined) props.delta = trend
    return
  }
  if (!isRecord(trend)) {
    return
  }
  if (props.delta === undefined && trend.value !== undefined) {
    props.delta = String(trend.value)
  }
  if (props.deltaTone === undefined && typeof trend.isPositive === 'boolean') {
    props.deltaTone = trend.isPositive ? 'positive' : 'negative'
  }
}

function normalizeDirection(props: Record<string, unknown>): void {
  const direction = asString(props.direction)
  if (direction === 'column') props.direction = 'vertical'
  if (direction === 'row') props.direction = 'horizontal'
}

function normalizeLayoutValues(props: Record<string, unknown>): void {
  const justify = asString(props.justify).toLowerCase()
  const mappedJustify = JUSTIFY_ALIASES[justify]
  if (mappedJustify) props.justify = mappedJustify

  const align = asString(props.align).toLowerCase()
  const mappedAlign = ALIGN_ALIASES[align]
  if (mappedAlign) props.align = mappedAlign
}

function normalizeSpacing(props: Record<string, unknown>): void {
  for (const key of SPACING_PROPS) {
    const token = asString(props[key])
    if (token && SPACING_TOKENS[token]) {
      props[key] = SPACING_TOKENS[token]
    }
  }
}

function normalizeTypeProps(type: string, props: Record<string, unknown>): void {
  switch (type) {
    case 'Grid':
      normalizeGridColumns(props)
      break
    case 'Stat':
      if (props.label === undefined) {
        const title = asString(props.title)
        if (title) {
          props.label = title
          clearProp(props, 'title')
        }
      }
      if (props.value !== undefined && props.value !== null && typeof props.value !== 'string') {
        props.value = String(props.value)
      }
      if (props.delta !== undefined && props.delta !== null && typeof props.delta !== 'string') {
        props.delta = String(props.delta)
      }
      break
    case 'Select':
    case 'RadioGroup':
    case 'MultiSelect':
      setProp(props, 'options', joinOptions(props.options))
      break
    case 'Table':
      setProp(props, 'columns', joinColumns(props.columns))
      setProp(props, 'rows', joinRows(props.rows))
      break
    case 'Tabs':
      setProp(props, 'items', joinTabItems(props.items))
      break
    case 'KeyValue':
      setProp(props, 'items', joinKeyValueItems(props.items))
      break
    case 'Repeat':
      if (!asString(props.statePath)) {
        const fromAlias =
          asString(props.items) ||
          asString(props.data) ||
          asString(props.source) ||
          asString(props.of)
        if (fromAlias) {
          props.statePath = fromAlias
        }
      }
      break
    case 'ProgressSteps':
      setProp(props, 'steps', joinLines(props.steps))
      break
    default:
      break
  }
}

/**
 * `cols` accepts a count or a breakpoint map such as `{ default: 1, md: 3 }`.
 * The catalog grid is already responsive, so collapse to the widest track count.
 */
function normalizeGridColumns(props: Record<string, unknown>): void {
  const raw = props.cols ?? props.columns
  clearProp(props, 'cols')
  if (raw === undefined || raw === null) {
    return
  }
  const counts: number[] = []
  if (isRecord(raw)) {
    for (const value of Object.values(raw)) {
      const count = Number(value)
      if (Number.isFinite(count)) counts.push(count)
    }
  } else {
    const count = Number(raw)
    if (Number.isFinite(count)) counts.push(count)
  }
  if (counts.length === 0) {
    return
  }
  const widest = Math.max(...counts)
  setProp(props, 'columns', String(Math.min(4, Math.max(2, Math.round(widest)))))
}

function joinOptions(raw: unknown): unknown {
  if (!Array.isArray(raw)) {
    return raw
  }
  return raw
    .map((option) => {
      if (isRecord(option)) {
        return asString(option.label) || asString(option.value)
      }
      return typeof option === 'string' ? option.trim() : String(option ?? '')
    })
    .filter(Boolean)
    .join(', ')
}

function joinColumns(raw: unknown): unknown {
  if (!Array.isArray(raw)) {
    return raw
  }
  return raw
    .map((column) => {
      if (isRecord(column)) {
        return asString(column.key) || asString(column.label)
      }
      return typeof column === 'string' ? column.trim() : String(column ?? '')
    })
    .filter(Boolean)
    .join(', ')
}

function joinRows(raw: unknown): unknown {
  if (!Array.isArray(raw)) {
    return raw
  }
  return raw
    .map((row) => {
      if (Array.isArray(row)) {
        return row.map((cell) => String(cell ?? '')).join(' | ')
      }
      if (isRecord(row)) {
        return Object.values(row)
          .map((cell) => String(cell ?? ''))
          .join(' | ')
      }
      return typeof row === 'string' ? row.trim() : ''
    })
    .filter(Boolean)
    .join('\n')
}

function joinTabItems(raw: unknown): unknown {
  if (!Array.isArray(raw)) {
    return raw
  }
  return raw
    .map((item) => {
      if (!isRecord(item)) {
        return typeof item === 'string' ? item.trim() : ''
      }
      const label = asString(item.label) || asString(item.title)
      const path = asString(item.path) || asString(item.to)
      return label && path ? `${label}|${path}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function joinKeyValueItems(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!isRecord(item)) {
          return typeof item === 'string' ? item.trim() : ''
        }
        const key = asString(item.key) || asString(item.label)
        const value = item.value === undefined ? '' : String(item.value)
        return key ? `${key}: ${value}` : ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (isRecord(raw)) {
    return Object.entries(raw)
      .map(([key, value]) => `${key}: ${value === undefined ? '' : String(value)}`)
      .join('\n')
  }
  return raw
}

function joinLines(raw: unknown): unknown {
  if (!Array.isArray(raw)) {
    return raw
  }
  return raw
    .map((line) => (typeof line === 'string' ? line.trim() : String(line ?? '')))
    .filter(Boolean)
    .join('\n')
}
