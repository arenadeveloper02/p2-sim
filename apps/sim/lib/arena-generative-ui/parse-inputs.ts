import {
  ARENA_GENERATIVE_APP_PAGE_PATH_PATTERN,
  type ArenaGenerativeApiBinding,
  type ArenaGenerativePageHint,
} from '@/lib/arena-generative-ui/types'

function parseJsonValue(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return raw
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return undefined
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    throw new Error('Value must be valid JSON')
  }
}

/**
 * Parses optional page hints from a JSON array or already-parsed list.
 */
export function parsePageHints(raw: unknown): ArenaGenerativePageHint[] {
  if (raw == null || raw === '') {
    return []
  }
  const parsed = parseJsonValue(raw)
  if (!Array.isArray(parsed)) {
    throw new Error('pages must be a JSON array of { path, title, purpose? }')
  }
  return parsed.map((item, index) => {
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
 */
export function parseApiBindings(raw: unknown): ArenaGenerativeApiBinding[] {
  if (raw == null || raw === '') {
    return []
  }
  const parsed = parseJsonValue(raw)
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
