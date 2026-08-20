import type { Spec } from '@json-render/core'
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

export interface ArenaGenerativeApiBinding {
  key: string
  label: string
  kind: 'workflow' | 'http'
  workflowId?: string
  http?: ArenaGenerativeHttpBinding
  inputSchema?: Array<{ name: string; type: string }>
  /**
   * Response field names and types, usable as `statePath` values because the
   * host merges an object response's top-level keys into app state. Missing
   * top-level names warn in preview; the action still succeeds.
   */
  outputSchema?: Array<{ name: string; type: string }>
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
  apiKey: string
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
}

/** Host state path DataText should bind to while a streaming CTA is in flight. */
export const ARENA_GENERATIVE_STREAM_CONTENT_KEY = 'content'

/** Host state key a failed CTA writes its message to. */
export const ARENA_GENERATIVE_ERROR_KEY = 'error'

/** Host state key for a warn-only outputSchema mismatch. */
export const ARENA_GENERATIVE_SCHEMA_WARNING_KEY = 'schemaWarning'

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
] as const

const PREFERRED_DISPLAY_KEYS = ['content', 'assistantContent', 'output', 'text', 'message'] as const

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

/**
 * Host state patch from a CTA payload: top-level business keys, no telemetry.
 */
export function actionStateFromData(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return omitActionTelemetry(data as Record<string, unknown>)
  }
  return { result: data }
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
 * Best-effort text for DataText `content` from a JSON action payload.
 * Prefers string | .content | .assistantContent | .output | .text | .message.
 * Nested JSON strings are parsed so the execution envelope is not dumped twice.
 */
export function displayTextFromActionData(data: unknown, depth = 0): string | undefined {
  if (depth > MAX_DISPLAY_PARSE_DEPTH) {
    return undefined
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
  for (const key of PREFERRED_DISPLAY_KEYS) {
    const value = record[key]
    if (value === undefined) continue
    const nested = displayTextFromActionData(value, depth + 1)
    if (nested) return nested
  }
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
 * Action ids whose API binding has `stream: true`.
 */
export function streamingActionIdsFrom(
  manifest: Pick<ArenaGenerativeAppManifest, 'actions'>,
  bindings: Array<Pick<ArenaGenerativeApiBinding, 'key' | 'stream'>>
): string[] {
  const streamingKeys = new Set(
    bindings.filter((binding) => binding.stream === true).map((binding) => binding.key)
  )
  if (streamingKeys.size === 0) return []
  return Object.entries(manifest.actions)
    .filter(([, action]) => streamingKeys.has(action.apiKey))
    .map(([actionId]) => actionId)
}

/** Most `onLoad` actions a single page may declare. */
export const MAX_PAGE_ON_LOAD_ACTIONS = 6

/**
 * Most items a `Repeat` will render. Caps a large payload so a generated page
 * cannot mount thousands of Cards from one response.
 */
export const MAX_REPEAT_ITEMS = 48

/** Current row while rendering a `Repeat` child. Inner Repeats shadow this. */
export interface RepeatItemScope {
  item: unknown
  index: number
}

const ITEM_TEMPLATE_PLACEHOLDER = /\{(item(?:\.[A-Za-z_][\w]*)*|index)\}/g

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Walks a dotted path on a plain object. Missing segments resolve to undefined
 * rather than throwing, so a bound region can fall through to its placeholder.
 */
export function readHostStatePath(root: unknown, path: string): unknown {
  if (!path) return undefined
  return path.split('.').reduce<unknown>((current, segment) => {
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
 * Interpolates every string prop on an element against the current Repeat item.
 * Non-strings, and strings with no `{…}` placeholders, pass through unchanged.
 */
export function interpolateRepeatProps(
  props: Record<string, unknown>,
  scope?: RepeatItemScope
): Record<string, unknown> {
  if (!scope) return props
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    next[key] = typeof value === 'string' ? interpolateItemTemplate(value, scope) : value
  }
  return next
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
 * something to fetch by; only the path half identifies a page.
 */
export function splitNavTarget(target: string): { path: string; query: string } {
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
