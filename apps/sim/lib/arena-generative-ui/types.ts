import type { Spec } from '@json-render/core'
import type { ArenaGenerativeGenerateWarning } from '@/lib/arena-generative-ui/generate-warnings'
import type { ArenaGenerativeTheme } from '@/lib/arena-generative-ui/theme'

export type { ArenaGenerativeTheme }

export const ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Narrows a page payload to a json-render Spec (`root` + `elements`).
 */
export function isJsonRenderSpec(value: unknown): value is Spec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.root === 'string' &&
    Boolean(record.elements) &&
    typeof record.elements === 'object' &&
    !Array.isArray(record.elements)
  )
}
/** Public host path for published generative apps (`/gui-apps/{identifier}`). */
export const ARENA_GENERATIVE_APP_BASE_PATH = '/gui-apps'
/** Session-only draft preview (`/gui-apps/preview/{draftId}`). */
export const ARENA_GENERATIVE_APP_PREVIEW_BASE_PATH = '/gui-apps/preview'
/** JSON API prefix for generative apps (`/api/gui-apps/...`). */
export const ARENA_GENERATIVE_APP_API_BASE_PATH = '/api/gui-apps'
/** Identifiers that collide with static `/gui-apps` segments. */
export const ARENA_GENERATIVE_APP_RESERVED_IDENTIFIERS = ['preview'] as const
export const ARENA_EMAIL_COOKIE_NAME = 'arena_email_id'
export const ARENA_ACCESS_DENIED_MESSAGE = 'Do not have access'

/**
 * Returns true when an identifier would shadow a static `/gui-apps` route.
 */
export function isReservedGenerativeAppIdentifier(identifier: string): boolean {
  return (ARENA_GENERATIVE_APP_RESERVED_IDENTIFIERS as readonly string[]).includes(identifier)
}

export type ArenaGenerativeHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ArenaGenerativePageHint {
  path: string
  title: string
  purpose?: string
}

export interface ArenaGenerativeHttpBinding {
  method: ArenaGenerativeHttpMethod
  url: string
  headersSecretName?: string
  /** Header to send the secret on (e.g. `X-API-Key`). Omit to use Bearer. */
  authHeaderName?: string
  /** Request timeout override. Clamped by the runner; omit to use the default. */
  timeoutMs?: number
}

export const ARENA_GENERATIVE_INPUT_SOURCES = ['form', 'visitorEmail', 'constant'] as const

/** How a CTA fills a bound workflow/HTTP start input. */
export type ArenaGenerativeInputSource = (typeof ARENA_GENERATIVE_INPUT_SOURCES)[number]

export interface ArenaGenerativeInputSchemaField {
  name: string
  type: string
  description?: string
  /**
   * Where the host gets this value. Omitted/`form` collects a named form field
   * (including a lead/contact `email`). `visitorEmail` copies the signed-in
   * user's address. `constant` uses `value`. Start `input` is always `constant`
   * (optional first-message prefix; empty is allowed).
   */
  source?: ArenaGenerativeInputSource
  /** Used when `source` is `constant`. Optional for the chat `input` prefix. */
  value?: string
}

export interface ArenaGenerativeApiBinding {
  key: string
  label: string
  kind: 'workflow' | 'http'
  workflowId?: string
  http?: ArenaGenerativeHttpBinding
  inputSchema?: ArenaGenerativeInputSchemaField[]
  /**
   * Response field names and types, usable as `statePath` values because the
   * host merges an object response's top-level keys into app state. Missing
   * top-level names warn in preview; the action still succeeds.
   */
  outputSchema?: Array<{ name: string; type: string }>
  /**
   * `sample` means Output schema came from Sample response. Generate/edit keep
   * those fields instead of replacing them with the last-run or deployed schema.
   * Omit when the schema was inferred from the last successful run, Response, or Agent.
   */
  outputSchemaSource?: 'sample'
  /**
   * Warn-only notes when outputSchema came from a last successful run that may
   * not match the current deploy (stale version, truncated log, empty list).
   */
  outputSchemaWarnings?: string[]
  /**
   * Sample response paste, kept so Add an API can show it again on edit.
   * Generate/edit prompts use `outputSchema` and a synthetic example, not this
   * string.
   */
  outputSample?: string
  /**
   * Truncated example of a streamed prose body. Prompt-only — the runner never
   * sends this upstream. Used when stream is true and Output format is not JSON.
   */
  outputHint?: string
  /** Cursor or offset paging; the host appends `items` on page 2+. */
  pagination?: ArenaGenerativePagination
  /** When true, the host streams CTA tokens into DataText instead of waiting for JSON. */
  stream?: boolean
  /**
   * Send the visitor's Arena `emailId` to this HTTP endpoint as `arenaEmailId`.
   * Off by default so no existing binding starts disclosing an end user's address
   * to a third party. Workflow bindings receive it regardless — they run inside
   * the same workspace.
   */
  forwardEmailId?: boolean
  /**
   * Workflow Start reserved fields (`input`, `conversationId`, `files`). Never
   * visitor form controls. The first form CTA composes `input`; Chat later
   * sends the composer text. The host stamps `conversationId` on both. HTTP
   * bindings omit this.
   */
  chatProtocol?: {
    input?: boolean
    conversationId?: boolean
    files?: boolean
  }
}

export interface ArenaGenerativePagination {
  mode: 'cursor' | 'offset'
  /** Top-level response array key to render and append, e.g. `articles`. */
  items: string
  /** Response field that holds the next cursor. Default `nextCursor`. */
  cursor?: string
  /** Request param that receives the cursor. Default `cursor`. */
  cursorParam?: string
  /** Request param that receives the offset. Default `offset`. */
  offsetParam?: string
  /** Request param that receives the page size. Default `limit`. */
  limitParam?: string
  /** Page size injected when the request omits it. Default 20, clamped 1–100. */
  limit?: number
  /** Optional top-level boolean (or truthy) response field for `hasMore`. */
  hasMore?: string
}

export interface ArenaGenerativePageManifest {
  title: string
  path: string
  spec: Spec
  /**
   * Action ids run once when the page mounts, before any user interaction, so a
   * page can show data on arrival instead of waiting for a click. The page's
   * query params are passed as the action values.
   */
  onLoad?: string[]
}

export interface ArenaGenerativeActionManifest {
  /** Declared binding key. Omitted for dummy/local actions. */
  apiKey?: string
  inputMapping?: Record<string, string>
  /**
   * State keys whose arrays concatenate on this action even on page 1.
   * Pagination already appends `items` on page 2+; use this for a Load-more-only action.
   */
  append?: string[]
  onSuccess?: {
    navigate?: string
    setState?: Record<string, unknown>
  }
  onError?: {
    setState?: Record<string, unknown>
  }
}

export interface ArenaGenerativeAppManifest {
  entryPath: string
  pages: Record<string, ArenaGenerativePageManifest>
  actions: Record<string, ArenaGenerativeActionManifest>
  /** Scoped `--gui-*` tokens. Omitted apps keep the host defaults. */
  theme?: ArenaGenerativeTheme
}

export interface ArenaGenerativeGenerateResult {
  success: boolean
  error?: string
  title?: string
  content?: string
  manifest?: ArenaGenerativeAppManifest
  structuredBrief?: {
    title: string
    archetype: string
    entryPath: string
    pages: Array<{ path: string; title: string }>
  }
  plannerError?: string
  /** Fail-open skips from this generate/edit. Empty when every stage ran. */
  generateWarnings?: ArenaGenerativeGenerateWarning[]
  editScope?: {
    mode: 'pages' | 'global' | 'theme' | 'replan'
    pages: string[]
  }
}

/** Host state path DataText should bind to while a streaming CTA is in flight. */
export const ARENA_GENERATIVE_STREAM_CONTENT_KEY = 'content'

/** Host-owned Chat transcript. API `setState` must not write this key. */
export const ARENA_GENERATIVE_CHAT_TURNS_KEY = 'chatTurns'

/**
 * Patch-only sentinel: `mergeHostState` copies this onto the last assistant
 * turn. Never stored as a public host key.
 */
export const ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_KEY = '__chatLastAssistant'

/** Host state key a failed CTA writes its message to. */
export const ARENA_GENERATIVE_ERROR_KEY = 'error'

/** Host state key for a warn-only outputSchema mismatch. */
export const ARENA_GENERATIVE_SCHEMA_WARNING_KEY = 'schemaWarning'

/** Host state key that holds the last submitted form values. */
export const ARENA_GENERATIVE_INPUTS_KEY = 'inputs'

/** Host state key that holds the Repeat row copied by a `selectItem` Button. */
export const ARENA_GENERATIVE_SELECTED_KEY = 'selected'

/** Host state key for the selected Repeat row's `id` / `key` / `slug` (else index). */
export const ARENA_GENERATIVE_SELECTED_ID_KEY = 'selectedId'

/**
 * Keys that must not be copied from a form submit into `inputs` — they collide
 * with host-owned CTA / pagination state.
 */
const RESERVED_SUBMITTED_INPUT_KEYS = new Set([
  ARENA_GENERATIVE_STREAM_CONTENT_KEY,
  ARENA_GENERATIVE_CHAT_TURNS_KEY,
  ARENA_GENERATIVE_ERROR_KEY,
  ARENA_GENERATIVE_SCHEMA_WARNING_KEY,
  ARENA_GENERATIVE_INPUTS_KEY,
  ARENA_GENERATIVE_SELECTED_KEY,
  ARENA_GENERATIVE_SELECTED_ID_KEY,
  'hasMore',
  'nextCursor',
  'offset',
  'input',
  'conversationId',
  'files',
])

/**
 * Host state patch that snapshots CTA form values under `inputs` so the next
 * page can bind them before the API responds. Reserved host keys are dropped.
 */
export function submittedInputsState(values: Record<string, unknown>): Record<string, unknown> {
  const inputs: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (RESERVED_SUBMITTED_INPUT_KEYS.has(key)) continue
    inputs[key] = value
  }
  return { [ARENA_GENERATIVE_INPUTS_KEY]: inputs }
}

function selectedItemId(item: unknown, index: number): string {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const record = item as Record<string, unknown>
    for (const field of ['id', 'key', 'slug'] as const) {
      const value = record[field]
      if (typeof value === 'string' && value) return value
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    }
  }
  return String(index)
}

/**
 * Host state patch when a Repeat Button with `selectItem` is clicked. Copies the
 * row into `selected` and its prose into `content` without calling an API.
 * Does not touch `inputs` or collection keys such as `history` or `items`.
 */
export function selectedItemHostState(item: unknown, index: number): Record<string, unknown> {
  const content = displayTextFromActionData(item)
  const selected = item && typeof item === 'object' && !Array.isArray(item) ? item : { item }
  return {
    ...clearedActionErrorState(),
    [ARENA_GENERATIVE_SELECTED_KEY]: selected,
    [ARENA_GENERATIVE_SELECTED_ID_KEY]: selectedItemId(item, index),
    ...(content ? { [ARENA_GENERATIVE_STREAM_CONTENT_KEY]: content } : {}),
  }
}

/**
 * Host state patch that leaves the list collection in place and drops the
 * copied row so an in-page History detail can return to the list.
 */
export function clearedSelectedItemHostState(): Record<string, unknown> {
  return {
    ...clearedSelectedIdHostState(),
    [ARENA_GENERATIVE_STREAM_CONTENT_KEY]: undefined,
  }
}

/**
 * Drops `selected` / `selectedId` without wiping generate `content`, so a
 * History tab or Chip view-switch can show the list while the article remains.
 */
export function clearedSelectedIdHostState(): Record<string, unknown> {
  return {
    ...clearedActionErrorState(),
    [ARENA_GENERATIVE_SELECTED_KEY]: undefined,
    [ARENA_GENERATIVE_SELECTED_ID_KEY]: undefined,
  }
}

/**
 * Keys a page `onLoad` must not blank. CTA prose, chat, and form echo have to
 * survive History / dashboard fetches that share the same host object.
 */
const PAGE_LOAD_PRESERVED_KEYS = new Set([
  ARENA_GENERATIVE_STREAM_CONTENT_KEY,
  ARENA_GENERATIVE_INPUTS_KEY,
  ARENA_GENERATIVE_CHAT_TURNS_KEY,
])

/**
 * First visit to an `onLoad` page: drop that page's bound keys so its regions
 * skeleton instead of flashing a previous record, keep generate `content` /
 * `inputs`, and clear leftover selection so a History tab shows the list.
 */
export function pageLoadArrivalState(loadHostKeys: readonly string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...clearedSelectedIdHostState() }
  for (const key of loadHostKeys) {
    if (PAGE_LOAD_PRESERVED_KEYS.has(key)) continue
    patch[key] = undefined
  }
  return patch
}

function buttonSelectNavigateTo(props: Record<string, unknown> | undefined): string {
  return typeof props?.navigateTo === 'string' ? props.navigateTo.trim() : ''
}

/**
 * True when a Repeat Open copies a row without leaving this page (`selectItem`
 * with no `navigateTo`, or `navigateTo` equal to `currentPath`).
 */
export function specHasSamePageSelectItem(spec: Spec, currentPath?: string): boolean {
  const elements = spec.elements
  if (!elements || typeof elements !== 'object' || Array.isArray(elements)) return false
  for (const element of Object.values(
    elements as Record<string, { type?: string; props?: Record<string, unknown> }>
  )) {
    if (element.type !== 'Button' || element.props?.selectItem !== true) continue
    const navigateTo = buttonSelectNavigateTo(element.props)
    if (!navigateTo) return true
    if (currentPath && splitNavTarget(navigateTo).path === currentPath) return true
  }
  return false
}

/** Scrolls the generative-app document to the top after Open / Back on History. */
export function scrollGenerativeAppToTop(): void {
  if (typeof window === 'undefined') return
  window.scrollTo(0, 0)
}

/**
 * Message for a failed CTA, if any. Generated specs are not required to bind
 * `error` anywhere, so hosts read it directly rather than hoping the model
 * authored a place to show it.
 */
export function actionErrorFrom(state: Record<string, unknown>): string {
  const value = state[ARENA_GENERATIVE_ERROR_KEY]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

/** Message for a warn-only outputSchema mismatch, if any. */
export function actionSchemaWarningFrom(state: Record<string, unknown>): string {
  const value = state[ARENA_GENERATIVE_SCHEMA_WARNING_KEY]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

/** State patch that clears a previously surfaced CTA error or schema warning. */
export function clearedActionErrorState(): Record<string, unknown> {
  return {
    [ARENA_GENERATIVE_ERROR_KEY]: undefined,
    [ARENA_GENERATIVE_SCHEMA_WARNING_KEY]: undefined,
  }
}

export interface ArenaGenerativeTabItem {
  label: string
  path: string
}

/**
 * Parses a `Tabs.items` string of newline-separated `Label|path` rows. A row
 * without a separator uses its single value as both label and path.
 */
export function parseTabItems(raw: unknown): ArenaGenerativeTabItem[] {
  if (typeof raw !== 'string') return []
  const items: ArenaGenerativeTabItem[] = []
  for (const line of raw.split('\n')) {
    const row = line.trim()
    if (!row) continue
    const separator = row.indexOf('|')
    const label = (separator >= 0 ? row.slice(0, separator) : row).trim()
    const path = (separator >= 0 ? row.slice(separator + 1) : row).trim()
    if (!label || !path) continue
    items.push({ label, path })
  }
  return items
}

/** Workflow/LLM envelope keys that must not appear in GUI-app state or DataText. */
export const ACTION_TELEMETRY_KEYS = [
  'tokens',
  'providerTiming',
  'finishReason',
  'model',
  'query',
  'cost',
  'usage',
  'timeSegments',
] as const

const ACTION_TELEMETRY_ROOTS = new Set<string>(ACTION_TELEMETRY_KEYS)

/**
 * True when an outputSchema path or statePath is execution telemetry the host
 * strips (`tokens`, `cost`, `providerTiming`, `timeSegments`, …).
 */
export function isActionTelemetryRoot(path: string): boolean {
  if (typeof path !== 'string') return false
  const trimmed = path.trim()
  if (!trimmed) return false
  const dot = trimmed.indexOf('.')
  const bracket = trimmed.indexOf('[')
  const separator = [dot, bracket].filter((index) => index >= 0).sort((a, b) => a - b)[0]
  const root = separator == null ? trimmed : trimmed.slice(0, separator)
  return ACTION_TELEMETRY_ROOTS.has(root)
}

/** Drops outputSchema rows whose top-level key is execution telemetry. */
export function omitTelemetrySchemaFields<T extends { name: string }>(fields: readonly T[]): T[] {
  return fields.filter((field) => !isActionTelemetryRoot(field.name))
}

const PREFERRED_DISPLAY_KEYS = ['content', 'assistantContent', 'output', 'text', 'message'] as const

const DISPLAY_PATH_ALIASES = new Set<string>([...PREFERRED_DISPLAY_KEYS, 'body'])

const MAX_DISPLAY_PARSE_DEPTH = 4

/**
 * Drops execution-envelope telemetry so Table/KeyValue bindings see business fields.
 */
export function omitActionTelemetry(record: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record }
  for (const key of ACTION_TELEMETRY_KEYS) {
    delete next[key]
  }
  return next
}

const RESPONSE_ENVELOPE_KEYS = new Set(['data', 'status', 'headers'])

const PREFERRED_COLLECTION_KEYS = ['history', 'items', 'results', 'records', 'rows'] as const

const MAX_UNWRAP_DEPTH = 4

const MAX_COLLECTION_LIFT_DEPTH = 3

/**
 * Response-block execution returns `{ data, status, headers }`. Some workflows
 * omit `status`/`headers` and still wrap the body in `data`. Host state should
 * merge the JSON body keys (`history`) instead of `data.run_data.history`.
 */
export function unwrapResponseBlockEnvelope(data: unknown, depth = 0): unknown {
  if (depth > MAX_UNWRAP_DEPTH) {
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
  if (!keys.every((key) => RESPONSE_ENVELOPE_KEYS.has(key))) {
    return data
  }
  return unwrapResponseBlockEnvelope(record.data, depth + 1)
}

/**
 * Copies nested arrays (`run_data.history`) to top-level keys (`history`) so
 * Repeat/Table can bind the last segment. Existing top-level keys win.
 */
export function liftNestedCollections(record: Record<string, unknown>): Record<string, unknown> {
  const lifted: Record<string, unknown> = {}
  walkForCollections(record, 0, record, lifted)
  if (
    !Object.hasOwn(record, 'items') &&
    !Object.hasOwn(lifted, 'items') &&
    Object.keys(lifted).length === 1
  ) {
    const only = Object.values(lifted)[0]
    if (Array.isArray(only)) {
      lifted.items = only
    }
  }
  return lifted
}

function walkForCollections(
  node: unknown,
  depth: number,
  root: Record<string, unknown>,
  lifted: Record<string, unknown>
): void {
  if (depth > MAX_COLLECTION_LIFT_DEPTH || !isPlainRecord(node)) {
    return
  }
  for (const [key, value] of Object.entries(omitActionTelemetry(node))) {
    if (Array.isArray(value)) {
      if (!Object.hasOwn(root, key) && !Object.hasOwn(lifted, key)) {
        lifted[key] = flattenCollectionItems(value)
      }
      continue
    }
    if (isPlainRecord(value)) {
      walkForCollections(value, depth + 1, root, lifted)
    }
  }
}

/**
 * Resolves a Repeat/Table `statePath` value to an array. Walks a single nested
 * object (`run_data.history` or `{ data: { run_data: { history } } }`) and
 * prefers keys named history/items/results.
 */
export function collectionFromBoundValue(value: unknown, depth = 0): unknown[] | undefined {
  if (depth > MAX_UNWRAP_DEPTH) {
    return undefined
  }
  if (Array.isArray(value)) {
    return flattenCollectionItems(value)
  }
  if (typeof value === 'string') {
    const parsed = parseJsonLiteral(value)
    return parsed === undefined ? undefined : collectionFromBoundValue(parsed, depth + 1)
  }
  if (!isPlainRecord(value)) {
    return undefined
  }
  const record = omitActionTelemetry(value)
  for (const key of PREFERRED_COLLECTION_KEYS) {
    const nested = record[key]
    if (Array.isArray(nested)) {
      return flattenCollectionItems(nested)
    }
  }
  const arrays = Object.values(record).filter(Array.isArray)
  if (arrays.length === 1) {
    return flattenCollectionItems(arrays[0] as unknown[])
  }
  const objects = Object.values(record).filter(isPlainRecord)
  if (objects.length === 1) {
    return collectionFromBoundValue(objects[0], depth + 1)
  }
  for (const key of PREFERRED_COLLECTION_KEYS) {
    if (record[key] === undefined) continue
    const found = collectionFromBoundValue(record[key], depth + 1)
    if (found) return found
  }
  return undefined
}

function flattenCollectionItems(items: unknown[]): unknown[] {
  return items.map((item) => {
    if (!isPlainRecord(item)) return item
    const input = item.input
    const next = isPlainRecord(input) ? { ...input, ...item } : { ...item }
    if (next.date === undefined && next.createdAt !== undefined) {
      next.date = next.createdAt
    }
    return next
  })
}

/**
 * Promotes business keys out of Agent/LLM display fields so Repeat/Table can
 * bind `items` when the workflow returned `{ assistantContent: '{"items":[...]}' }`
 * or `{ output: { items: [...] } }`. Existing top-level keys win.
 */
export function liftParsedDisplayFields(record: Record<string, unknown>): Record<string, unknown> {
  const lifted: Record<string, unknown> = {}
  const preferred = new Set<string>(PREFERRED_DISPLAY_KEYS)
  for (const key of PREFERRED_DISPLAY_KEYS) {
    const parsed = unwrapResponseBlockEnvelope(parsePreferredDisplayValue(record[key]))
    if (parsed === undefined) continue
    if (Array.isArray(parsed)) {
      if (!Object.hasOwn(record, 'result') && !Object.hasOwn(lifted, 'result')) {
        lifted.result = parsed
      }
      continue
    }
    if (!parsed || typeof parsed !== 'object') continue
    const nested = omitActionTelemetry(parsed as Record<string, unknown>)
    for (const [nestedKey, nestedValue] of Object.entries(nested)) {
      if (preferred.has(nestedKey)) continue
      if (Object.hasOwn(record, nestedKey) || Object.hasOwn(lifted, nestedKey)) continue
      lifted[nestedKey] = nestedValue
    }
  }
  return lifted
}

function parsePreferredDisplayValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return parseJsonLiteral(value)
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value
  }
  return undefined
}

/**
 * Host state patch from a CTA payload: top-level business keys, no telemetry.
 */
export function actionStateFromData(data: unknown): Record<string, unknown> {
  const unwrapped = unwrapResponseBlockEnvelope(data)
  if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
    const record = omitActionTelemetry(unwrapped as Record<string, unknown>)
    return { ...liftNestedCollections(record), ...liftParsedDisplayFields(record), ...record }
  }
  return { result: unwrapped }
}

/**
 * Parses a JSON object or array literal. Returns undefined for prose or invalid JSON.
 */
export function parseJsonLiteral(value: string): unknown | undefined {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined
  }
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return undefined
  }
}

/**
 * True when a string is markdown/prose rather than a status token or JSON blob.
 */
function looksLikeDisplayProse(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || parseJsonLiteral(trimmed) !== undefined) return false
  return trimmed.length >= 40 || trimmed.includes('\n') || trimmed.startsWith('#')
}

/**
 * Longest own-property prose string on a payload (`artical_data`, `article_data`).
 */
function proseStringFromRecord(record: Record<string, unknown>): string | undefined {
  let best: string | undefined
  for (const value of Object.values(record)) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!looksLikeDisplayProse(trimmed)) continue
    if (!best || trimmed.length > best.length) best = trimmed
  }
  return best
}

function prefersProseOverDump(dumped: string | undefined): boolean {
  if (!dumped) return true
  const trimmed = dumped.trim()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

/**
 * Best-effort text for DataText `content` from a JSON action payload.
 * Prefers string | .content | .assistantContent | .output | .text | .message,
 * then a markdown string field, then a JSON dump. Nested JSON strings are parsed
 * so the execution envelope is not dumped twice.
 */
export function displayTextFromActionData(data: unknown, depth = 0): string | undefined {
  if (depth > MAX_DISPLAY_PARSE_DEPTH) {
    return undefined
  }
  if (depth === 0) {
    data = unwrapResponseBlockEnvelope(data)
  }
  if (typeof data === 'string') {
    const parsed = parseJsonLiteral(data)
    if (parsed !== undefined) {
      return displayTextFromActionData(parsed, depth + 1)
    }
    return data.trim() ? data : undefined
  }
  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data)
  }
  if (!data || typeof data !== 'object') {
    return undefined
  }
  if (Array.isArray(data)) {
    return stringifyActionData(data)
  }
  const record = omitActionTelemetry(data as Record<string, unknown>)
  let fromPreferred: string | undefined
  for (const key of PREFERRED_DISPLAY_KEYS) {
    const value = record[key]
    if (value === undefined) continue
    const nested = displayTextFromActionData(value, depth + 1)
    if (nested) {
      fromPreferred = nested
      break
    }
  }
  const fromProse = proseStringFromRecord(record)
  if (fromProse && prefersProseOverDump(fromPreferred)) {
    return fromProse
  }
  if (fromPreferred) return fromPreferred
  if (fromProse) return fromProse
  if (Object.keys(record).length === 0) {
    return undefined
  }
  return stringifyActionData(record)
}

function stringifyActionData(data: unknown): string | undefined {
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return undefined
  }
}

/**
 * Action ids whose API binding has `stream: true` or `chatProtocol.input`.
 * Chat follow-ups stream without requiring the draft to set `stream`.
 */
export function streamingActionIdsFrom(
  manifest: Pick<ArenaGenerativeAppManifest, 'actions'>,
  bindings: Array<Pick<ArenaGenerativeApiBinding, 'key' | 'stream' | 'chatProtocol'>>
): string[] {
  const streamingKeys = new Set(
    bindings
      .filter((binding) => binding.stream === true || binding.chatProtocol?.input === true)
      .map((binding) => binding.key)
  )
  if (streamingKeys.size === 0) return []
  return Object.entries(manifest.actions)
    .filter(([, action]) => Boolean(action.apiKey && streamingKeys.has(action.apiKey)))
    .map(([actionId]) => actionId)
}

/** Most `onLoad` actions a single page may declare. */
export const MAX_PAGE_ON_LOAD_ACTIONS = 6

/**
 * Historical Repeat render cap. The host pages Repeat locally
 * (`LOCAL_COLLECTION_PAGE_SIZE`) instead of silently truncating.
 */
export const MAX_REPEAT_ITEMS = 48

/** Current row while rendering a `Repeat` child. Inner Repeats shadow this. */
export interface RepeatItemScope {
  item: unknown
  index: number
}

const ITEM_TEMPLATE_PLACEHOLDER = /\{(item(?:\.[A-Za-z_][\w]*)*|index)\}/g

const BINDING_TEMPLATE_PLACEHOLDER = /\{([^}]+)\}/g

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Walks a dotted path on a plain object. Missing segments resolve to undefined
 * rather than throwing, so a bound region can fall through to its placeholder.
 * A string field plus `.content` / `.text` / `.output` (generated Agent wrapping)
 * resolves to that string so DataText still shows markdown.
 */
export function readHostStatePath(root: unknown, path: string): unknown {
  if (!path) return undefined
  return path.split('.').reduce<unknown>((current, segment) => {
    if (typeof current === 'string') {
      return DISPLAY_PATH_ALIASES.has(segment) ? current : undefined
    }
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[segment]
  }, root)
}

/**
 * Resolves a `statePath` against the current Repeat item when it is `item` or
 * `item.field`, otherwise against host state. Nested Repeats bind `item.field`
 * to the inner row, so an inner Repeat can still read `item.comments` from
 * the outer row via its own `statePath`.
 */
export function readScopedStatePath(
  state: Record<string, unknown>,
  path: string,
  scope?: RepeatItemScope
): unknown {
  if (path === 'item' || path.startsWith('item.')) {
    if (!scope) return undefined
    if (path === 'item') return scope.item
    return readHostStatePath(scope.item, path.slice('item.'.length))
  }
  return readHostStatePath(state, path)
}

function templatePlaceholderValue(token: string, scope: RepeatItemScope): string {
  if (token === 'index') {
    return String(scope.index)
  }
  const value =
    token === 'item' ? scope.item : readHostStatePath(scope.item, token.slice('item.'.length))
  if (value === undefined || value === null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

/**
 * Substitutes `{item}`, `{item.field}`, and `{index}` in a string prop. Used
 * for labels, hrefs, and navigation targets such as `order?id={item.id}`.
 * `statePath` uses the dotted form without braces (`item.title`).
 */
export function interpolateItemTemplate(template: string, scope: RepeatItemScope): string {
  if (!template.includes('{')) return template
  return template.replace(ITEM_TEMPLATE_PLACEHOLDER, (_match, token: string) =>
    templatePlaceholderValue(token, scope)
  )
}

/**
 * Collapses a binding token so `Target Keyword`, `targetKeyword`, and
 * `target_keyword` match the same form field.
 */
export function normalizeBindingToken(token: string): string {
  return token.replace(/[^A-Za-z0-9]/g, '').toLowerCase()
}

function isBindingScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function scalarFromRecord(record: Record<string, unknown>, token: string): string | undefined {
  const exact = readHostStatePath(record, token)
  if (isBindingScalar(exact)) return String(exact)
  const normalized = normalizeBindingToken(token)
  if (!normalized) return undefined
  for (const [key, value] of Object.entries(record)) {
    if (!isBindingScalar(value)) continue
    if (normalizeBindingToken(key) === normalized) return String(value)
  }
  return undefined
}

/**
 * Resolves a `{field}` / `{Field Label}` token against host state, then
 * `inputs`, including camelCase / spaced-label aliases.
 */
export function lookupHostBindingValue(
  state: Record<string, unknown>,
  token: string
): string | undefined {
  const trimmed = token.trim()
  if (!trimmed) return undefined
  const fromState = scalarFromRecord(state, trimmed)
  if (fromState !== undefined) return fromState
  const inputs = state[ARENA_GENERATIVE_INPUTS_KEY]
  if (isPlainRecord(inputs)) {
    return scalarFromRecord(inputs, trimmed)
  }
  return undefined
}

function isItemTemplateToken(token: string): boolean {
  return token === 'index' || token === 'item' || token.startsWith('item.')
}

export interface InterpolateElementOptions {
  state?: Record<string, unknown>
  scope?: RepeatItemScope
  pending?: boolean
}

/**
 * Substitutes Repeat `{item.*}` / `{index}` first, then host `{field}` tokens
 * from submitted `inputs` or response keys. Unresolved host tokens become
 * empty (including while pending) so Results never flashes `{Target Keyword}`.
 */
export function interpolateBindingTemplate(
  template: string,
  options: InterpolateElementOptions = {}
): string {
  if (!template.includes('{')) return template
  const { state, scope, pending = false } = options
  return template.replace(BINDING_TEMPLATE_PLACEHOLDER, (match, rawToken: string) => {
    const token = rawToken.trim()
    if (isItemTemplateToken(token)) {
      if (!scope) return match
      return templatePlaceholderValue(token, scope)
    }
    if (!state) return pending ? '' : match
    const resolved = lookupHostBindingValue(state, token)
    if (resolved !== undefined) return resolved
    return ''
  })
}

/**
 * Interpolates every string prop against Repeat scope and host state.
 * Non-strings, and strings with no `{…}` placeholders, pass through unchanged.
 */
export function interpolateElementProps(
  props: Record<string, unknown>,
  options: InterpolateElementOptions = {}
): Record<string, unknown> {
  if (!options.scope && !options.state) return props
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    next[key] = typeof value === 'string' ? interpolateBindingTemplate(value, options) : value
  }
  return next
}

/**
 * Interpolates every string prop on an element against the current Repeat item.
 * Non-strings, and strings with no `{…}` placeholders, pass through unchanged.
 */
export function interpolateRepeatProps(
  props: Record<string, unknown>,
  scope?: RepeatItemScope
): Record<string, unknown> {
  return interpolateElementProps(props, { scope })
}

/** Stable React key for one Repeat iteration. Prefers `id` / `key` / `slug`. */
export function repeatItemKey(item: unknown, index: number): string {
  if (isPlainRecord(item)) {
    for (const field of ['id', 'key', 'slug'] as const) {
      const value = item[field]
      if (typeof value === 'string' && value) return `${index}-${value}`
      if (typeof value === 'number' && Number.isFinite(value)) return `${index}-${value}`
    }
  }
  return String(index)
}

/**
 * Action input for a Button / Form inside Repeat: the row's own fields, so
 * `inputMapping` can send `id` the same way page query params do.
 */
export function repeatItemActionValues(item: unknown, index: number): Record<string, unknown> {
  if (isPlainRecord(item)) {
    return { ...item, index }
  }
  return { item, index }
}

/**
 * Action input key carrying the visitor's Arena `emailId`.
 *
 * **This value is not verified.** `resolveArenaEmailIdFromRequest` accepts it from
 * the request body, the query string, or the Arena cookie, and the emailId gate only
 * checks that *something* is present — so a caller can supply any address. Treat it
 * as a personalization hint, never as an authorization key: a workflow that scopes
 * data by it can be made to return another user's data. The name deliberately reads
 * as "the value Arena passed" rather than an identity.
 */
export const ARENA_GENERATIVE_ACTOR_EMAIL_KEY = 'arenaEmailId'

/**
 * Query params the host owns; never forwarded to a page's load actions.
 * `arenaEmailId` is here so a page URL cannot inject the key the host sets itself.
 */
export const ARENA_GENERATIVE_RESERVED_QUERY_KEYS = [
  'emailId',
  ARENA_GENERATIVE_ACTOR_EMAIL_KEY,
  'conversationId',
] as const

/**
 * Page query params as flat action input. A repeated param keeps its first
 * value because binding inputs are scalars.
 */
export function pageParamsFromQuery(
  query: Record<string, string | string[] | undefined>
): Record<string, string> {
  const reserved = new Set<string>(ARENA_GENERATIVE_RESERVED_QUERY_KEYS)
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (reserved.has(key)) continue
    const first = Array.isArray(value) ? value[0] : value
    if (typeof first === 'string' && first) {
      params[key] = first
    }
  }
  return params
}

/**
 * Splits a navigation target such as `order?id=ord_9` into its page path and
 * raw query string. Navigation targets carry params so a page's `onLoad` has
 * something to fetch by; only the path half identifies a page. Same-page Chat
 * actions omit navigate — callers must not throw on a missing target.
 */
export function splitNavTarget(target: string | null | undefined): { path: string; query: string } {
  if (typeof target !== 'string') {
    return { path: '', query: '' }
  }
  const separator = target.indexOf('?')
  if (separator < 0) {
    return { path: target.trim(), query: '' }
  }
  return { path: target.slice(0, separator).trim(), query: target.slice(separator + 1) }
}

/**
 * Absolute URL for an in-app navigation target, preserving its query params and
 * re-attaching the host-owned `emailId`.
 */
export function navigationHref(basePath: string, target: string, emailId?: string): string {
  const { path, query } = splitNavTarget(target)
  const params = new URLSearchParams(query)
  if (emailId) {
    params.set('emailId', emailId)
  }
  const search = params.toString()
  return `${basePath}/${path}${search ? `?${search}` : ''}`
}

/** `onLoad` action ids per page path, for hosts that only hold the config. */
export function pageOnLoadFrom(
  manifest: Pick<ArenaGenerativeAppManifest, 'pages'>
): Record<string, string[]> {
  const byPath: Record<string, string[]> = {}
  for (const [path, page] of Object.entries(manifest.pages)) {
    if (page.onLoad && page.onLoad.length > 0) {
      byPath[path] = page.onLoad
    }
  }
  return byPath
}

/**
 * `onSuccess.navigate` target per action. Hosts navigate to it before the request starts so the
 * result page mounts while the action is still pending and its loading placeholders can show.
 */
export function actionNavigateFrom(
  manifest: Pick<ArenaGenerativeAppManifest, 'actions'>
): Record<string, string> {
  const targets: Record<string, string> = {}
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    const path = action.onSuccess?.navigate
    if (path) {
      targets[actionId] = path
    }
  }
  return targets
}
