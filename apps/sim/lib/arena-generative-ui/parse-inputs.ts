import { truncate } from '@sim/utils/string'
import { OUTPUT_HINT_MAX_LENGTH } from '@/lib/arena-generative-ui/output-schema'
import {
  ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN,
  type ArenaGenerativeApiBinding,
  type ArenaGenerativePageHint,
  type ArenaGenerativePagination,
} from '@/lib/arena-generative-ui/types'

const JSON_FENCE_PREFIX = /^```(?:json)?\s*\r?\n?/i

function isEmptyJsonListInput(raw: unknown): boolean {
  if (raw == null || raw === '') {
    return true
  }
  if (typeof raw === 'string' && raw.trim() === '') {
    return true
  }
  if (Array.isArray(raw) && raw.length === 0) {
    return true
  }
  if (typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0) {
    return true
  }
  return false
}

function stripJsonFence(raw: string): string {
  let text = raw.trim()
  if (!JSON_FENCE_PREFIX.test(text)) {
    return text
  }
  text = text.replace(JSON_FENCE_PREFIX, '')
  const closeIdx = text.lastIndexOf('```')
  if (closeIdx >= 0) {
    text = text.slice(0, closeIdx)
  }
  return text.trim()
}

/**
 * Index just past the first balanced `{…}` / `[…]` in `text`, or -1 when the text
 * holds no complete value. Depth is counted directly rather than read off the
 * `JSON.parse` error message: V8 reports `position N` for trailing content, but
 * JavaScriptCore (the app runs on Bun) reports only `Unable to parse JSON string`,
 * so a message-derived offset silently stops working in production.
 */
function firstJsonValueEnd(text: string): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
    } else if (char === '{' || char === '[') {
      depth += 1
    } else if (char === '}' || char === ']') {
      depth -= 1
      if (depth === 0) {
        return index + 1
      }
      if (depth < 0) {
        return -1
      }
    }
  }
  return -1
}

function tryParseJson(text: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(text) }
  } catch {
    return null
  }
}

function parseJsonWithRest(text: string): { value: unknown; rest: string } | null {
  const whole = tryParseJson(text)
  if (whole) {
    return { value: whole.value, rest: '' }
  }
  const end = firstJsonValueEnd(text)
  if (end > 0 && end < text.length) {
    const prefix = tryParseJson(text.slice(0, end))
    if (prefix) {
      return { value: prefix.value, rest: text.slice(end) }
    }
  }
  const withoutTrailingCommas = text.replace(/,\s*([}\]])/g, '$1')
  if (withoutTrailingCommas !== text) {
    return parseJsonWithRest(withoutTrailingCommas)
  }
  return null
}

function parseJsonAllowingTrailing(text: string): unknown {
  const parsed = parseJsonWithRest(text)
  if (!parsed) {
    throw new Error('Value must be valid JSON')
  }
  return parsed.value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasUsablePages(pages: unknown): boolean {
  if (Array.isArray(pages)) {
    return pages.some((item) => {
      if (!item || typeof item !== 'object') return false
      const record = item as Record<string, unknown>
      if (typeof record.path === 'string' && record.path.trim()) return true
      if (typeof record.title === 'string' && record.title.trim()) return true
      return Boolean(record.spec && typeof record.spec === 'object')
    })
  }
  return isRecord(pages) && Object.keys(pages).length > 0
}

function payloadHasPages(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (hasUsablePages(value.pages)) return true
  return isRecord(value.manifest) && hasUsablePages(value.manifest.pages)
}

const MANIFEST_FIELD_KEYS = ['entryPath', 'pages', 'actions'] as const

/**
 * Picks the object to validate: nested `manifest` only when it has pages,
 * otherwise wrapper-level `pages` merged onto a stub nested manifest.
 */
export function extractManifestCandidate(parsed: Record<string, unknown>): Record<string, unknown> {
  const nested = isRecord(parsed.manifest) ? parsed.manifest : undefined
  if (nested && hasUsablePages(nested.pages)) {
    return nested
  }
  if (hasUsablePages(parsed.pages)) {
    const candidate: Record<string, unknown> = nested ? { ...nested } : {}
    for (const key of MANIFEST_FIELD_KEYS) {
      if (parsed[key] !== undefined) {
        candidate[key] = parsed[key]
      }
    }
    return candidate
  }
  return nested ?? parsed
}

/**
 * Parses model JSON. If the reply contains more than one object, prefers the
 * one that includes `pages` or `manifest.pages` instead of a short prefix.
 */
export function parseLlmJsonObject(text: string): Record<string, unknown> {
  const stripped = stripJsonFence(text)
  if (!stripped) {
    throw new Error('Model returned a non-object JSON payload')
  }

  const objects: Record<string, unknown>[] = []
  let remaining = stripped
  while (remaining.trim()) {
    const start = remaining.indexOf('{')
    if (start < 0) break
    remaining = remaining.slice(start)
    const parsed = parseJsonWithRest(remaining)
    if (!parsed) {
      remaining = remaining.slice(1)
      continue
    }
    if (isRecord(parsed.value)) {
      objects.push(parsed.value)
    }
    remaining = parsed.rest
  }

  const withPages = objects.filter(payloadHasPages)
  const chosen = withPages.at(-1) ?? objects.at(-1)
  if (!chosen) {
    throw new Error('Model returned a non-object JSON payload')
  }
  return chosen
}

/**
 * Parses a JSON string or value, stripping markdown fences and leftover text
 * after the first complete value.
 */
export function parseLooseJsonValue(raw: unknown): unknown {
  if (raw == null) {
    return undefined
  }
  if (typeof raw !== 'string') {
    return raw
  }
  const stripped = stripJsonFence(raw)
  if (!stripped) {
    return undefined
  }

  try {
    return parseJsonAllowingTrailing(stripped)
  } catch {
    const objectStart = stripped.indexOf('{')
    const arrayStart = stripped.indexOf('[')
    const starts = [objectStart, arrayStart].filter((index) => index >= 0)
    if (starts.length === 0) {
      throw new Error('Value must be valid JSON')
    }
    return parseJsonAllowingTrailing(stripped.slice(Math.min(...starts)))
  }
}

function tryParseLooseJsonValue(raw: unknown): unknown {
  try {
    return parseLooseJsonValue(raw)
  } catch {
    return undefined
  }
}

/**
 * Parses optional page hints from a JSON array or already-parsed list.
 * Empty or unusable input means the model chooses the sitemap.
 */
export function parsePageHints(raw: unknown): ArenaGenerativePageHint[] {
  if (isEmptyJsonListInput(raw)) {
    return []
  }
  const parsed = tryParseLooseJsonValue(raw)
  if (parsed == null || isEmptyJsonListInput(parsed)) {
    return []
  }
  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && 'path' in parsed
      ? [parsed]
      : null
  if (!items) {
    return []
  }
  return items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`pages[${index}] must be an object`)
    }
    const record = item as Record<string, unknown>
    const path = typeof record.path === 'string' ? record.path.trim() : ''
    if (!ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN.test(path)) {
      throw new Error(`pages[${index}].path is invalid`)
    }
    return {
      path,
      title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : path,
      purpose: typeof record.purpose === 'string' ? record.purpose : undefined,
    }
  })
}

/**
 * Normalizes a binding's `inputSchema` / `outputSchema` list, dropping entries
 * without a string `name` and defaulting a missing `type` to `string`.
 * Returns undefined when the value is not an array so the key stays absent.
 */
function schemaFields(raw: unknown): Array<{ name: string; type: string }> | undefined {
  if (!Array.isArray(raw)) {
    return undefined
  }
  return raw
    .filter((field): field is { name: string; type?: unknown } => {
      return (
        Boolean(field) &&
        typeof field === 'object' &&
        typeof (field as { name?: unknown }).name === 'string'
      )
    })
    .map((field) => ({
      name: field.name,
      type: typeof field.type === 'string' ? field.type : 'string',
    }))
}

const TOP_LEVEL_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/

function optionalParamName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed && TOP_LEVEL_KEY.test(trimmed) ? trimmed : undefined
}

/**
 * Parses a binding's `pagination` block. Invalid objects throw so a typo does
 * not silently disable Load more.
 */
function parsePagination(raw: unknown, index: number): ArenaGenerativePagination | undefined {
  if (raw == null) return undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`apiBindings[${index}].pagination must be an object`)
  }
  const record = raw as Record<string, unknown>
  const mode = record.mode === 'offset' ? 'offset' : record.mode === 'cursor' ? 'cursor' : null
  if (!mode) {
    throw new Error(`apiBindings[${index}].pagination.mode must be cursor or offset`)
  }
  const items = typeof record.items === 'string' ? record.items.trim() : ''
  if (!items || !TOP_LEVEL_KEY.test(items)) {
    throw new Error(`apiBindings[${index}].pagination.items must be a top-level array key`)
  }
  const pagination: ArenaGenerativePagination = { mode, items }
  const cursor = optionalParamName(record.cursor)
  if (cursor) pagination.cursor = cursor
  const cursorParam = optionalParamName(record.cursorParam)
  if (cursorParam) pagination.cursorParam = cursorParam
  const offsetParam = optionalParamName(record.offsetParam)
  if (offsetParam) pagination.offsetParam = offsetParam
  const limitParam = optionalParamName(record.limitParam)
  if (limitParam) pagination.limitParam = limitParam
  const hasMore = optionalParamName(record.hasMore)
  if (hasMore) pagination.hasMore = hasMore
  if (typeof record.limit === 'number' && Number.isFinite(record.limit)) {
    pagination.limit = Math.min(Math.max(Math.trunc(record.limit), 1), 100)
  }
  return pagination
}

/**
 * Parses API bindings from a JSON array or already-parsed list.
 * Empty means no CTAs — the model must not invent keys.
 */
export function parseApiBindings(raw: unknown): ArenaGenerativeApiBinding[] {
  if (isEmptyJsonListInput(raw)) {
    return []
  }
  let parsed: unknown
  try {
    parsed = parseLooseJsonValue(raw)
  } catch {
    throw new Error('apiBindings must be valid JSON')
  }
  if (parsed == null || isEmptyJsonListInput(parsed)) {
    return []
  }
  if (!Array.isArray(parsed)) {
    throw new Error('apiBindings must be a JSON array')
  }
  const bindings: ArenaGenerativeApiBinding[] = []
  for (const [index, item] of parsed.entries()) {
    if (!item || typeof item !== 'object') {
      throw new Error(`apiBindings[${index}] must be an object`)
    }
    const record = item as Record<string, unknown>
    const key = typeof record.key === 'string' ? record.key.trim() : ''
    if (!key) {
      throw new Error(`apiBindings[${index}].key is required`)
    }
    const kind = record.kind === 'http' ? 'http' : record.kind === 'workflow' ? 'workflow' : null
    if (!kind) {
      throw new Error(`apiBindings[${index}].kind must be workflow or http`)
    }
    const binding: ArenaGenerativeApiBinding = {
      key,
      label: typeof record.label === 'string' && record.label.trim() ? record.label.trim() : key,
      kind,
    }
    if (kind === 'workflow') {
      const workflowId = typeof record.workflowId === 'string' ? record.workflowId.trim() : ''
      if (!workflowId) {
        throw new Error(`apiBindings[${index}].workflowId is required for workflow bindings`)
      }
      binding.workflowId = workflowId
    } else {
      const http =
        record.http && typeof record.http === 'object'
          ? (record.http as Record<string, unknown>)
          : record
      const methodRaw = typeof http.method === 'string' ? http.method.toUpperCase() : 'POST'
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(methodRaw)) {
        throw new Error(`apiBindings[${index}].http.method is invalid`)
      }
      const url = typeof http.url === 'string' ? http.url.trim() : ''
      if (!url) {
        throw new Error(`apiBindings[${index}].http.url is required`)
      }
      binding.http = {
        method: methodRaw as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url,
        headersSecretName:
          typeof http.headersSecretName === 'string' && http.headersSecretName.trim()
            ? http.headersSecretName.trim()
            : undefined,
        authHeaderName:
          typeof http.authHeaderName === 'string' && http.authHeaderName.trim()
            ? http.authHeaderName.trim()
            : undefined,
        timeoutMs:
          typeof http.timeoutMs === 'number' && Number.isFinite(http.timeoutMs)
            ? http.timeoutMs
            : undefined,
      }
    }
    const inputSchema = schemaFields(record.inputSchema)
    if (inputSchema) {
      binding.inputSchema = inputSchema
    }
    const outputSchema = schemaFields(record.outputSchema)
    if (outputSchema) {
      binding.outputSchema = outputSchema
    }
    if (typeof record.outputHint === 'string' && record.outputHint.trim()) {
      binding.outputHint = truncate(record.outputHint.trim(), OUTPUT_HINT_MAX_LENGTH)
    }
    const pagination = parsePagination(record.pagination, index)
    if (pagination) {
      binding.pagination = pagination
    }
    if (record.stream === true) {
      binding.stream = true
    }
    if (record.forwardEmailId === true) {
      binding.forwardEmailId = true
    }
    bindings.push(binding)
  }
  return bindings
}
