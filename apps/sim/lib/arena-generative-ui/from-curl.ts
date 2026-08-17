import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeHttpMethod,
} from '@/lib/arena-generative-ui/types'

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
    },
  }
  if (parsed.inputSchema && parsed.inputSchema.length > 0) {
    binding.inputSchema = parsed.inputSchema
  }
  return binding
}

function parseCurl(raw: string): {
  method: ArenaGenerativeHttpMethod
  url: string
  inputSchema?: Array<{ name: string; type: string }>
} {
  const tokens = tokenizeCurl(normalizeCurlText(raw))
  if (tokens.length === 0) {
    throw new Error('Curl is required')
  }

  let index = 0
  if (tokens[0] === 'curl' || tokens[0].endsWith('/curl')) {
    index = 1
  }

  let methodRaw: string | undefined
  let url: string | undefined
  let body: string | undefined
  let forceGet = false

  while (index < tokens.length) {
    const token = tokens[index]
    const { flag, inlineValue } = splitFlag(token)

    if (flag === '-X' || flag === '--request') {
      methodRaw = nextValue(tokens, index, inlineValue, 'Curl method is missing')
      index += inlineValue === undefined ? 2 : 1
      continue
    }

    if (flag === '-H' || flag === '--header') {
      index += inlineValue === undefined ? 2 : 1
      continue
    }

    if (
      flag === '-d' ||
      flag === '--data' ||
      flag === '--data-raw' ||
      flag === '--data-binary' ||
      flag === '--data-ascii'
    ) {
      body = nextValue(tokens, index, inlineValue, 'Curl body is missing')
      index += inlineValue === undefined ? 2 : 1
      continue
    }

    if (flag === '--url') {
      url = nextValue(tokens, index, inlineValue, 'Curl is missing a valid URL')
      index += inlineValue === undefined ? 2 : 1
      continue
    }

    if (GET_FLAGS.has(flag)) {
      forceGet = true
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

  if (!url || !isHttpUrl(url)) {
    throw new Error('Curl is missing a valid URL')
  }

  const method = (methodRaw?.toUpperCase() || (forceGet ? 'GET' : 'POST')) as string
  if (!HTTP_METHODS.has(method)) {
    throw new Error('Curl method is invalid')
  }

  return {
    method: method as ArenaGenerativeHttpMethod,
    url,
    inputSchema: inputSchemaFromBody(body),
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

function nextValue(
  tokens: string[],
  index: number,
  inlineValue: string | undefined,
  missingMessage: string
): string {
  if (inlineValue !== undefined) {
    return inlineValue
  }
  const value = tokens[index + 1]
  if (!value) {
    throw new Error(missingMessage)
  }
  return value
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
  if (!body?.trim() || body.startsWith('@')) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined
    }
    return Object.entries(parsed as Record<string, unknown>).map(([name, value]) => ({
      name,
      type: schemaTypeFromValue(value),
    }))
  } catch {
    return undefined
  }
}

function schemaTypeFromValue(value: unknown): string {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'array'
  if (value && typeof value === 'object') return 'object'
  return 'string'
}
