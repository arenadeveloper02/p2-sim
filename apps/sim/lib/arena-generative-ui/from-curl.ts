import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeHttpMethod,
} from '@/lib/arena-generative-ui/types'
import { AGENT_STREAM_PROTOCOL_HEADER } from '@/lib/workflows/streaming/agent-stream-protocol'

const HTTP_METHODS = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

const VALUE_FLAGS = new Set([
  '-X',
  '--request',
  '-H',
  '--header',
  '-d',
  '--data',
  '--data-raw',
  '--data-binary',
  '--data-ascii',
  '--url',
  '-u',
  '--user',
  '-A',
  '--user-agent',
  '-o',
  '--output',
  '-b',
  '--cookie',
  '-e',
  '--referer',
])

const GET_FLAGS = new Set(['-G', '--get'])
const STREAM_FLAGS = new Set(['-N', '--no-buffer'])
const PROTOCOL_BODY_KEYS = new Set(['stream', 'includeThinking', 'includeToolCalls'])

const SMART_QUOTES: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
}

export interface HttpBindingFromCurlInput {
  key: string
  curl: string
  headersSecretName?: string
  /** When true, the binding streams CTA tokens instead of waiting for JSON. */
  stream?: boolean
}

/**
 * True when the curl looks like a streaming request: `-N` / `--no-buffer`,
 * `Accept: text/event-stream`, or `X-Sim-Stream-Protocol`. JSON body
 * `"stream": true` alone does not count. Incomplete curls still return a hint.
 */
export function curlLooksLikeStream(curl: string): boolean {
  return inspectCurl(curl).looksLikeStream
}

/**
 * True when the curl sets an auth header (`Authorization`, `X-API-Key`, …).
 */
export function curlHasAuthHeader(curl: string): boolean {
  return Boolean(inspectCurl(curl).authHeaderName)
}

/**
 * Builds an HTTP API binding from a curl command plus the CTA key and optional
 * workspace env var name. Header values in the curl are ignored so secrets
 * never land in the stored JSON.
 */
export function httpBindingFromCurl(input: HttpBindingFromCurlInput): ArenaGenerativeApiBinding {
  const key = input.key.trim()
  if (!key) {
    throw new Error('Key is required')
  }

  const parsed = parseCurl(input.curl)
  const secretName = input.headersSecretName?.trim()
  const binding: ArenaGenerativeApiBinding = {
    key,
    label: key,
    kind: 'http',
    http: {
      method: parsed.method,
      url: parsed.url,
      ...(secretName ? { headersSecretName: secretName } : {}),
      ...(parsed.authHeaderName ? { authHeaderName: parsed.authHeaderName } : {}),
    },
  }
  if (parsed.inputSchema && parsed.inputSchema.length > 0) {
    binding.inputSchema = parsed.inputSchema
  }
  if (input.stream === true) {
    binding.stream = true
  }
  return binding
}

function inspectCurl(raw: string): {
  methodRaw?: string
  url?: string
  body?: string
  forceGet: boolean
  looksLikeStream: boolean
  authHeaderName?: string
} {
  const tokens = tokenizeCurl(normalizeCurlText(raw))
  let index = 0
  if (tokens[0] === 'curl' || tokens[0]?.endsWith('/curl')) {
    index = 1
  }

  let methodRaw: string | undefined
  let url: string | undefined
  let body: string | undefined
  let forceGet = false
  let looksLikeStream = false
  let authHeaderName: string | undefined

  while (index < tokens.length) {
    const token = tokens[index]
    const { flag, inlineValue } = splitFlag(token)

    if (flag === '-X' || flag === '--request') {
      const taken = takeFlagValue(tokens, index, inlineValue)
      if (taken.value) methodRaw = taken.value
      index += taken.consumed
      continue
    }

    if (flag === '-H' || flag === '--header') {
      const header = inlineValue ?? tokens[index + 1]
      if (header && !header.startsWith('-')) {
        if (headerLooksLikeStream(header)) {
          looksLikeStream = true
        }
        const authName = authHeaderNameFrom(header)
        if (authName && !authHeaderName) {
          authHeaderName = authName
        }
        index += inlineValue === undefined ? 2 : 1
      } else {
        index += 1
      }
      continue
    }

    if (
      flag === '-d' ||
      flag === '--data' ||
      flag === '--data-raw' ||
      flag === '--data-binary' ||
      flag === '--data-ascii'
    ) {
      const taken = takeFlagValue(tokens, index, inlineValue)
      if (taken.value) body = taken.value
      index += taken.consumed
      continue
    }

    if (flag === '--url') {
      const taken = takeFlagValue(tokens, index, inlineValue)
      if (taken.value) url = taken.value
      index += taken.consumed
      continue
    }

    if (GET_FLAGS.has(flag)) {
      forceGet = true
      index += 1
      continue
    }

    if (STREAM_FLAGS.has(flag)) {
      looksLikeStream = true
      index += 1
      continue
    }

    if (flag.startsWith('-')) {
      const canonical = flag.split('=', 1)[0]
      if (VALUE_FLAGS.has(canonical) && inlineValue === undefined) {
        index += 2
        continue
      }
      index += 1
      continue
    }

    if (isHttpUrl(token)) {
      url = token
    }
    index += 1
  }

  return { methodRaw, url, body, forceGet, looksLikeStream, authHeaderName }
}

function parseCurl(raw: string): {
  method: ArenaGenerativeHttpMethod
  url: string
  inputSchema?: Array<{ name: string; type: string }>
  authHeaderName?: string
} {
  const inspected = inspectCurl(raw)
  if (!inspected.url || !isHttpUrl(inspected.url)) {
    throw new Error(raw.trim() ? 'Curl is missing a valid URL' : 'Curl is required')
  }

  const method = (inspected.methodRaw?.toUpperCase() ||
    (inspected.forceGet ? 'GET' : 'POST')) as string
  if (!HTTP_METHODS.has(method)) {
    throw new Error('Curl method is invalid')
  }

  return {
    method: method as ArenaGenerativeHttpMethod,
    url: inspected.url,
    inputSchema: inputSchemaFromBody(inspected.body),
    authHeaderName: inspected.authHeaderName,
  }
}

function headerLooksLikeStream(header: string): boolean {
  const colon = header.indexOf(':')
  const name = (colon >= 0 ? header.slice(0, colon) : header).trim().toLowerCase()
  const value = (colon >= 0 ? header.slice(colon + 1) : '').toLowerCase()
  if (name === 'accept' && value.includes('text/event-stream')) {
    return true
  }
  return name === AGENT_STREAM_PROTOCOL_HEADER
}

function splitHeader(header: string): { name: string; value: string } {
  const colon = header.indexOf(':')
  if (colon < 0) {
    return { name: header.trim(), value: '' }
  }
  return {
    name: header.slice(0, colon).trim(),
    value: header.slice(colon + 1).trim(),
  }
}

function isAuthHeaderName(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower === 'authorization' ||
    lower === 'x-api-key' ||
    lower === 'api-key' ||
    lower === 'x-apikey' ||
    lower.endsWith('api-key')
  )
}

function authHeaderNameFrom(header: string): string | undefined {
  const { name } = splitHeader(header)
  return isAuthHeaderName(name) ? name : undefined
}

function tryParseJsonObject(body: string | undefined): Record<string, unknown> | undefined {
  if (!body?.trim() || body.startsWith('@')) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined
    }
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

function normalizeCurlText(raw: string): string {
  let text = raw.trim()
  for (const [from, to] of Object.entries(SMART_QUOTES)) {
    text = text.replaceAll(from, to)
  }
  return text.replace(/\\\r?\n/g, ' ')
}

function tokenizeCurl(text: string): string[] {
  const tokens: string[] = []
  let index = 0
  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index])) {
      index += 1
    }
    if (index >= text.length) break

    const quote = text[index] === '"' || text[index] === "'" ? text[index] : null
    if (quote) {
      index += 1
      let token = ''
      while (index < text.length && text[index] !== quote) {
        if (text[index] === '\\' && index + 1 < text.length) {
          token += text[index + 1]
          index += 2
          continue
        }
        token += text[index]
        index += 1
      }
      if (index < text.length) {
        index += 1
      }
      tokens.push(token)
      continue
    }

    let token = ''
    while (index < text.length && !/\s/.test(text[index])) {
      token += text[index]
      index += 1
    }
    tokens.push(token)
  }
  return tokens
}

function splitFlag(token: string): { flag: string; inlineValue?: string } {
  if (!token.startsWith('-')) {
    return { flag: token }
  }
  const equals = token.indexOf('=')
  if (equals > 1) {
    return { flag: token.slice(0, equals), inlineValue: token.slice(equals + 1) }
  }
  return { flag: token }
}

function takeFlagValue(
  tokens: string[],
  index: number,
  inlineValue: string | undefined
): { value?: string; consumed: number } {
  if (inlineValue !== undefined) {
    return { value: inlineValue, consumed: 1 }
  }
  const value = tokens[index + 1]
  if (!value) {
    return { consumed: 1 }
  }
  return { value, consumed: 2 }
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function inputSchemaFromBody(
  body: string | undefined
): Array<{ name: string; type: string }> | undefined {
  const parsed = tryParseJsonObject(body)
  if (!parsed) {
    return undefined
  }
  const fields = Object.entries(parsed)
    .filter(([name]) => !PROTOCOL_BODY_KEYS.has(name))
    .map(([name, value]) => ({
      name,
      type: schemaTypeFromValue(value),
    }))
  return fields.length > 0 ? fields : undefined
}

function schemaTypeFromValue(value: unknown): string {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'array'
  if (value && typeof value === 'object') return 'object'
  return 'string'
}
