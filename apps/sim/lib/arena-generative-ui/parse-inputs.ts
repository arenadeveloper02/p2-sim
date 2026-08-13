import { getErrorMessage } from '@sim/utils/errors'
import {
  ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN,
  type ArenaGenerativeApiBinding,
  type ArenaGenerativePageHint,
} from '@/lib/arena-generative-ui/types'

const JSON_FENCE_PREFIX = /^```(?:json)?\s*\r?\n?/i
const TRAILING_JSON_POSITION = /after JSON.*position\s+(\d+)/i

function isEmptyJsonListInput(raw: unknown): boolean {
  if (raw == null || raw === '') {
    return true
  }
  if (typeof raw === 'string' && raw.trim() === '') {
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

function parseJsonWithRest(text: string): { value: unknown; rest: string } | null {
  try {
    return { value: JSON.parse(text), rest: '' }
  } catch (error) {
    const message = getErrorMessage(error)
    const match = message.match(TRAILING_JSON_POSITION)
    if (match) {
      const cut = Number(match[1])
      if (Number.isFinite(cut) && cut > 0) {
        try {
          return { value: JSON.parse(text.slice(0, cut)), rest: text.slice(cut) }
        } catch {
          return null
        }
      }
    }
    const withoutTrailingCommas = text.replace(/,\s*([}\]])/g, '$1')
    if (withoutTrailingCommas !== text) {
      return parseJsonWithRest(withoutTrailingCommas)
    }
    return null
  }
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

function payloadHasPages(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.pages != null) return true
  return isRecord(value.manifest) && value.manifest.pages != null
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
      }
    }
    if (Array.isArray(record.inputSchema)) {
      binding.inputSchema = record.inputSchema
        .filter((field): field is { name: string; type: string } => {
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
    bindings.push(binding)
  }
  return bindings
}
