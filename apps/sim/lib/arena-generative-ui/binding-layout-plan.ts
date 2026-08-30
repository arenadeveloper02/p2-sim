import type { ArenaGenerativeChatProtocol } from '@/lib/arena-generative-ui/chat-protocol'
import { isOmittedGenerativeInputField } from '@/lib/arena-generative-ui/input-schema'
import { outputSchemaRootName } from '@/lib/arena-generative-ui/output-schema'
import {
  type ArenaGenerativeApiBinding,
  type ArenaGenerativeAppManifest,
  actionStateFromData,
  parseJsonLiteral,
} from '@/lib/arena-generative-ui/types'

const DISPLAY_ENVELOPE_KEYS = new Set(['assistantContent', 'output', 'text', 'message', 'body'])

const PROSE_ITEM_FIELDS = new Set([
  'output',
  'content',
  'body',
  'text',
  'message',
  'assistantContent',
])

export const HOST_RESERVED_STATE_ROOTS = [
  'content',
  'inputs',
  'selected',
  'selectedId',
  'error',
  'schemaWarning',
  'hasMore',
  'nextCursor',
  'offset',
  'result',
] as const

export type BindingLayoutKind =
  | 'prose'
  | 'stream'
  | 'stream-plus-json'
  | 'collection'
  | 'record'
  | 'metrics'

export interface BindingLayoutCollection {
  hostKey: string
  /** Schema paths the host lifts into `hostKey` (`run_data.history`). */
  schemaPaths: string[]
  /** Object prefixes that wrap the collection (`run_data`). */
  wrapperKeys: string[]
  itemFields: string[]
  proseFields: string[]
  samePageSelect: boolean
}

export interface BindingLayoutPlan {
  key: string
  kind: BindingLayoutKind
  hostKeys: string[]
  aliasKeys: string[]
  formFields: string[]
  hiddenInputFields: string[]
  collections: BindingLayoutCollection[]
  metricPaths: string[]
  recordKeys: string[]
  /** DataText paths: `content` and/or a top-level markdown string field. */
  prosePaths: string[]
  /** String field names that must not be bound as `field.content`. */
  stringFieldNames: string[]
  stream: boolean
  /** Workflow Start reserved fields; Chat binds these, never the form. */
  chatProtocol?: ArenaGenerativeChatProtocol
}

/**
 * Canonical host keys and component constraints derived from a binding's
 * schemas. Generate, the prompt, and validate-manifest share this object.
 */
export function layoutPlanForBinding(binding: ArenaGenerativeApiBinding): BindingLayoutPlan {
  const schema = binding.outputSchema ?? []
  const collections = collectionsFromSchema(schema)
  const stringFieldNames = topLevelStringFieldNames(schema)
  const metricPaths = metricPathsFromSchema(schema)
  const recordKeys = recordKeysFromSchema(schema, collections)
  const stream = binding.stream === true
  const kind = kindFrom({
    stream,
    hasCollection: collections.length > 0,
    hasMetrics: metricPaths.length > 0,
    hasRecords: recordKeys.length > 0,
    schemaCount: schema.length,
  })

  const hostKeys = uniqueStrings([
    ...collections.map((collection) => collection.hostKey),
    ...metricPaths.map((path) => outputSchemaRootName(path)).filter(Boolean),
    ...recordKeys,
    ...stringFieldNames,
    ...(stream || kind === 'prose' || collections.some((collection) => collection.samePageSelect)
      ? ['content']
      : []),
  ])

  const aliasKeys: string[] = []
  if (collections.length === 1 && collections[0] && collections[0].hostKey !== 'items') {
    aliasKeys.push('items')
  }
  if (binding.pagination) {
    aliasKeys.push('hasMore')
    if (binding.pagination.mode === 'cursor') aliasKeys.push('nextCursor')
    if (binding.pagination.mode === 'offset') aliasKeys.push('offset')
  }

  const { formFields, hiddenInputFields } = partitionInputFields(binding)

  const prosePaths = uniqueStrings([
    ...stringFieldNames,
    ...(stream || kind === 'prose' || collections.some((collection) => collection.samePageSelect)
      ? ['content']
      : []),
  ])

  return {
    key: binding.key,
    kind,
    hostKeys,
    aliasKeys,
    formFields,
    hiddenInputFields,
    collections,
    metricPaths,
    recordKeys,
    prosePaths,
    stringFieldNames,
    stream,
    ...(binding.chatProtocol ? { chatProtocol: binding.chatProtocol } : {}),
  }
}

export function layoutPlansFromBindings(
  bindings: ArenaGenerativeApiBinding[]
): BindingLayoutPlan[] {
  return bindings.map((binding) => layoutPlanForBinding(binding))
}

/**
 * True when the binding declared structured output (collections, metrics,
 * records, or top-level string fields). Missing schema stays on the heuristic
 * merge so gold examples and unspecialized drafts keep working.
 */
export function planHasStructuredSchema(plan: BindingLayoutPlan): boolean {
  return (
    plan.collections.length > 0 ||
    plan.metricPaths.length > 0 ||
    plan.recordKeys.length > 0 ||
    plan.stringFieldNames.length > 0
  )
}

/**
 * Host state from a CTA payload. Structured bindings emit lifted plan keys
 * (`history`) and drop wrappers (`run_data`); bindings without schema keep
 * {@link actionStateFromData}.
 */
export function actionStateFromPlan(
  data: unknown,
  plan?: BindingLayoutPlan
): Record<string, unknown> {
  const heuristic = actionStateFromData(data)
  if (!plan || !planHasStructuredSchema(plan)) {
    return heuristic
  }

  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(heuristic)) {
    if (omitFromPlanState(plan, key)) continue
    next[key] = value
  }
  for (const key of [...plan.hostKeys, ...plan.aliasKeys]) {
    if (key === 'content') continue
    if (heuristic[key] !== undefined) {
      next[key] = heuristic[key]
    }
  }
  return next
}

/**
 * Overlay `content` for DataText only when the display string is real prose
 * (or a stream). Structured JSON dumps stay off `content` so Repeat/Table
 * pages do not flash a stringified envelope.
 */
export function shouldBindActionContent(
  plan: BindingLayoutPlan,
  display: string,
  streamed: string
): boolean {
  if (!display) return false
  if (streamed.trim()) return true
  if (!planHasStructuredSchema(plan)) return true
  return parseJsonLiteral(display) === undefined
}

function omitFromPlanState(plan: BindingLayoutPlan, key: string): boolean {
  if (plan.collections.some((collection) => collection.wrapperKeys.includes(key))) {
    return true
  }
  if (plan.recordKeys.includes(key) || plan.stringFieldNames.includes(key)) {
    return false
  }
  if (key === 'content') return true
  return DISPLAY_ENVELOPE_KEYS.has(key) && plan.collections.length > 0
}

/**
 * Short prompt line kept next to `layoutPlan` so the model sees both the typed
 * contract and a one-line layout reminder.
 */
export function resultLayoutFromPlan(plan: BindingLayoutPlan): string {
  const proseCollection = plan.collections.find((collection) => collection.samePageSelect)
  if (proseCollection) {
    const sample = proseCollection.itemFields[0]
      ? `item.${proseCollection.itemFields[0]}`
      : 'item.keyword'
    const prose = proseCollection.proseFields[0] ?? 'output'
    return `list items include a prose field — Repeat cards bind only short scalars with ${sample}; Open is Button selectItem true (no actionId) and copies prose to content, not inputs; same-page detail uses showWhen "!selectedId" on the list and showWhen "selectedId" plus clearItem Back; do not bind item.${prose} inside Repeat; Results after Generate echo form names ({targetKeyword}), not history keys ({keyword})`
  }
  if (plan.kind === 'prose' && plan.stringFieldNames.length === 0 && !plan.stream) {
    return 'no outputSchema — DataText statePath "content"; do not invent Table columns'
  }
  if (
    plan.kind === 'stream' &&
    plan.collections.length === 0 &&
    plan.stringFieldNames.length === 0
  ) {
    return 'prose DataText matching outputHint'
  }
  const hostKeys = plan.hostKeys.filter((key) => key !== 'content').join(', ')
  return `bind layoutPlan.hostKeys as statePath (${hostKeys || 'content'}); nested arrays (run_data.history) also land as "${plan.collections[0]?.hostKey ?? 'history'}"; a string markdown field binds as that name or "content", never "field.content"`
}

function kindFrom(params: {
  stream: boolean
  hasCollection: boolean
  hasMetrics: boolean
  hasRecords: boolean
  schemaCount: number
}): BindingLayoutKind {
  if (params.stream && (params.hasCollection || params.hasMetrics || params.hasRecords)) {
    return 'stream-plus-json'
  }
  if (params.stream) return 'stream'
  if (params.hasCollection) return 'collection'
  if (params.hasMetrics && !params.hasRecords) return 'metrics'
  if (params.schemaCount > 0) return 'record'
  return 'prose'
}

function collectionsFromSchema(
  schema: Array<{ name: string; type: string }>
): BindingLayoutCollection[] {
  const arrayFields = schema.filter((field) => field.type === 'array' && !field.name.includes('[]'))
  const collections: BindingLayoutCollection[] = []
  const seen = new Set<string>()

  for (const arrayField of arrayFields) {
    const hostKey = lastPathSegment(arrayField.name)
    if (!hostKey || seen.has(hostKey)) continue
    seen.add(hostKey)
    const schemaPaths = uniqueStrings(
      schema
        .filter(
          (field) =>
            field.type === 'array' &&
            !field.name.includes('[]') &&
            lastPathSegment(field.name) === hostKey
        )
        .map((field) => field.name)
    )
    const wrapperKeys = uniqueStrings(
      schemaPaths.map((path) => wrapperPrefix(path, hostKey)).filter(Boolean)
    )
    const itemEntries = schema.filter((field) => isItemFieldOf(field.name, schemaPaths, hostKey))
    const itemFields: string[] = []
    const proseFields: string[] = []
    for (const entry of itemEntries) {
      const itemPath = itemPathFrom(entry.name, schemaPaths, hostKey)
      if (!itemPath) continue
      const leaf = lastPathSegment(itemPath)
      if (PROSE_ITEM_FIELDS.has(leaf)) {
        proseFields.push(leaf)
        continue
      }
      itemFields.push(itemPath)
      if (itemPath.startsWith('input.')) {
        itemFields.push(itemPath.slice('input.'.length))
      }
      if (leaf === 'createdAt') {
        itemFields.push('date')
      }
    }
    collections.push({
      hostKey,
      schemaPaths,
      wrapperKeys,
      itemFields: uniqueStrings(itemFields),
      proseFields: uniqueStrings(proseFields),
      samePageSelect: uniqueStrings(proseFields).length > 0,
    })
  }
  return collections
}

function isItemFieldOf(fieldName: string, schemaPaths: string[], hostKey: string): boolean {
  if (!fieldName.includes('[]')) return false
  for (const schemaPath of schemaPaths) {
    if (fieldName.startsWith(`${schemaPath}[]`)) return true
  }
  return fieldName.startsWith(`${hostKey}[]`)
}

function itemPathFrom(fieldName: string, schemaPaths: string[], hostKey: string): string {
  for (const schemaPath of schemaPaths) {
    const prefix = `${schemaPath}[].`
    if (fieldName.startsWith(prefix)) return fieldName.slice(prefix.length)
  }
  const hostPrefix = `${hostKey}[].`
  if (fieldName.startsWith(hostPrefix)) return fieldName.slice(hostPrefix.length)
  return ''
}

function wrapperPrefix(schemaPath: string, hostKey: string): string {
  if (schemaPath === hostKey) return ''
  const suffix = `.${hostKey}`
  return schemaPath.endsWith(suffix) ? schemaPath.slice(0, -suffix.length) : ''
}

function lastPathSegment(path: string): string {
  const parts = path
    .replace(/\[\]/g, '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function topLevelStringFieldNames(schema: Array<{ name: string; type: string }>): string[] {
  return uniqueStrings(
    schema
      .filter(
        (field) => field.type === 'string' && !field.name.includes('.') && !field.name.includes('[')
      )
      .map((field) => field.name)
  )
}

function metricPathsFromSchema(schema: Array<{ name: string; type: string }>): string[] {
  return schema
    .filter((field) => field.type === 'number' && !field.name.includes('[]'))
    .map((field) => field.name)
}

function recordKeysFromSchema(
  schema: Array<{ name: string; type: string }>,
  collections: BindingLayoutCollection[]
): string[] {
  const wrappers = new Set(collections.flatMap((collection) => collection.wrapperKeys))
  const collectionKeys = new Set(collections.map((collection) => collection.hostKey))
  return uniqueStrings(
    schema
      .filter(
        (field) =>
          field.type === 'object' &&
          !field.name.includes('.') &&
          !field.name.includes('[') &&
          !wrappers.has(field.name) &&
          !collectionKeys.has(field.name)
      )
      .map((field) => field.name)
  )
}

function partitionInputFields(binding: ArenaGenerativeApiBinding): {
  formFields: string[]
  hiddenInputFields: string[]
} {
  const formFields: string[] = []
  const hiddenInputFields: string[] = []
  for (const field of binding.inputSchema ?? []) {
    const name = field.name.trim()
    if (!name || isOmittedGenerativeInputField(field)) continue
    if (field.source === 'visitorEmail' || field.source === 'constant') {
      hiddenInputFields.push(name)
      continue
    }
    formFields.push(name)
  }
  return {
    formFields: uniqueStrings(formFields),
    hiddenInputFields: uniqueStrings(hiddenInputFields),
  }
}

/**
 * Host keys each action writes, from that action's binding layout plan.
 * Published config and SpecRenderer use this so a pending CTA only skeletons
 * the regions it actually fills.
 */
export function actionHostKeysFrom(
  manifest: Pick<ArenaGenerativeAppManifest, 'actions'>,
  bindings: ArenaGenerativeApiBinding[]
): Record<string, string[]> {
  const byKey = new Map(bindings.map((binding) => [binding.key, binding]))
  const result: Record<string, string[]> = {}
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    const binding = byKey.get(action.apiKey) ?? {
      key: action.apiKey,
      label: action.apiKey,
      kind: 'http' as const,
    }
    const plan = layoutPlanForBinding(binding)
    result[actionId] = uniqueStrings([...plan.hostKeys, ...plan.aliasKeys])
  }
  return result
}

/**
 * Chat protocol flags each action owns. SpecRenderer shows attach when `files`
 * is set; the runner stamps reserved keys only on Chat submits.
 */
export function actionChatProtocolFrom(
  manifest: Pick<ArenaGenerativeAppManifest, 'actions'>,
  bindings: ArenaGenerativeApiBinding[]
): Record<string, NonNullable<ArenaGenerativeApiBinding['chatProtocol']>> {
  const byKey = new Map(bindings.map((binding) => [binding.key, binding]))
  const result: Record<string, NonNullable<ArenaGenerativeApiBinding['chatProtocol']>> = {}
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    const protocol = byKey.get(action.apiKey)?.chatProtocol
    if (protocol) result[actionId] = protocol
  }
  return result
}

/**
 * `visitorEmail` / `constant` input names each action owns. SpecRenderer hides
 * those fields; the runner stamps them instead of taking the form value.
 */
export function actionHiddenInputsFrom(
  manifest: Pick<ArenaGenerativeAppManifest, 'actions'>,
  bindings: ArenaGenerativeApiBinding[]
): Record<string, string[]> {
  const byKey = new Map(bindings.map((binding) => [binding.key, binding]))
  const result: Record<string, string[]> = {}
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    const binding = byKey.get(action.apiKey)
    if (!binding) continue
    const hidden = layoutPlanForBinding(binding).hiddenInputFields
    if (hidden.length > 0) result[actionId] = hidden
  }
  return result
}

/**
 * First host-state segment of a `statePath` (`articles` from `articles[].title`).
 * Repeat `item.*` paths are scoped rows, not action outputs.
 */
export function hostStateRoot(statePath: string): string {
  const trimmed = statePath.trim()
  if (!trimmed || trimmed === 'item' || trimmed.startsWith('item.')) return ''
  const dot = trimmed.indexOf('.')
  const bracket = trimmed.indexOf('[')
  const separator = [dot, bracket].filter((index) => index >= 0).sort((a, b) => a - b)[0]
  return separator == null ? trimmed : trimmed.slice(0, separator)
}

/**
 * Whether a bound region should show loading chrome. Unknown paths fall back
 * to any in-flight action so unspecialized drafts keep today's skeletons.
 */
export function isBoundPathPending(
  statePath: string,
  pendingActionIds: ReadonlySet<string>,
  actionHostKeys: Record<string, readonly string[]>
): boolean {
  if (pendingActionIds.size === 0) return false
  const root = hostStateRoot(statePath)
  if (!root) return pendingActionIds.size > 0
  const writers: string[] = []
  for (const [actionId, keys] of Object.entries(actionHostKeys)) {
    if (keys.includes(root)) writers.push(actionId)
  }
  if (writers.length === 0) return true
  return writers.some((actionId) => pendingActionIds.has(actionId))
}

/**
 * Disable / busy chrome for a control that runs `actionId`. When the host does
 * not pass `pendingActionIds`, `fallbackPending` keeps existing tests working.
 */
export function isActionControlPending(
  actionId: string,
  pendingActionIds: ReadonlySet<string> | undefined,
  fallbackPending: boolean
): boolean {
  if (!actionId) return false
  if (pendingActionIds) return pendingActionIds.has(actionId)
  return fallbackPending
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}
