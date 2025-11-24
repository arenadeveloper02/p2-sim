import { env } from '@/lib/env'
import { createLogger } from '@/lib/logs/console/logger'
import type { ToolConfig, HttpMethod } from '@/tools/types'
import { transformTable } from '@/tools/utils'
import { SPYFU_BASE_URL, getSpyfuOperationDefinition } from '@/tools/spyfu/operations'
import type { SpyfuRequestParams, SpyfuResponse } from '@/tools/spyfu/types'

const logger = createLogger('SpyfuTool')

interface PreparedSpyfuRequest {
  url: string
  method: HttpMethod
  headers: Record<string, string>
  body?: Record<string, any> | string
  query: Record<string, string>
  endpointPath: string
}

const SUPPORTED_MODES: Array<SpyfuRequestParams['mode']> = ['predefined', 'custom']

function resolveMode(mode?: SpyfuRequestParams['mode']): SpyfuRequestParams['mode'] {
  if (mode && SUPPORTED_MODES.includes(mode)) {
    return mode
  }
  return 'predefined'
}

function resolveCredentials(params: SpyfuRequestParams): { username: string; password: string } {
  const username = params.apiUsername || env.SPYFU_API_USERNAME
  const password = params.apiPassword || env.SPYFU_API_PASSWORD

  if (!username || !password) {
    throw new Error(
      'SpyFu API credentials are missing. Provide username/password in the block or set SPYFU_API_USERNAME and SPYFU_API_PASSWORD.'
    )
  }

  return { username, password }
}

function ensureCustomPath(path?: string): string {
  if (!path || !path.trim()) {
    throw new Error('Custom SpyFu requests require an endpoint path.')
  }

  const trimmed = path.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  return `${SPYFU_BASE_URL}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`
}

function normalizeQueryParams(
  params: SpyfuRequestParams,
  mode: SpyfuRequestParams['mode']
): Record<string, string> {
  const table = Array.isArray(params.queryParamsTable)
    ? transformTable(params.queryParamsTable)
    : params.queryParamsTable && typeof params.queryParamsTable === 'object'
      ? params.queryParamsTable
      : {}

  const normalized: Record<string, string> = {}

  Object.entries(table).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }
    normalized[key] = typeof value === 'string' ? value : JSON.stringify(value)
  })

  if (params.countryCode && params.countryCode.trim()) {
    normalized.countryCode = params.countryCode.trim()
  }

  return normalized
}

function normalizeBody(body: SpyfuRequestParams['body']) {
  if (!body) return undefined
  if (typeof body === 'string') {
    const trimmed = body.trim()
    if (!trimmed) return undefined
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }
  return body
}

function prepareRequest(params: SpyfuRequestParams): PreparedSpyfuRequest {
  const mode = resolveMode(params.mode)
  const credentials = resolveCredentials(params)

  let method: HttpMethod
  let endpointPath: string

  if (mode === 'custom') {
    method = (params.customMethod || 'GET').toUpperCase() as HttpMethod
    endpointPath = ensureCustomPath(params.customPath)
  } else {
    if (!params.operationId) {
      throw new Error('Select a SpyFu operation before running this block.')
    }
    const operation = getSpyfuOperationDefinition(params.operationId)
    if (!operation) {
      throw new Error(`Unknown SpyFu operation: ${params.operationId}`)
    }
    method = operation.method
    endpointPath = `${SPYFU_BASE_URL}${operation.path}`
  }

  const query = normalizeQueryParams(params, mode)
  const url = new URL(endpointPath)

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value))
    }
  })

  const body = normalizeBody(params.body)

  const headers: Record<string, string> = {
    Accept: 'application/json, text/csv;q=0.9, */*;q=0.8',
    Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`,
  }

  if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  return {
    url: url.toString(),
    method,
    headers,
    body,
    query,
    endpointPath,
  }
}

export const spyfuRequestTool: ToolConfig<SpyfuRequestParams, SpyfuResponse> = {
  id: 'spyfu_request',
  name: 'SpyFu API',
  description: 'Call any SpyFu REST endpoint for domain, keyword, ranking, or account insights.',
  version: '1.0.0',
  params: {
    mode: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Use a predefined SpyFu endpoint or specify a custom path.',
    },
    operationId: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'The predefined SpyFu operation to execute.',
    },
    customPath: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Custom SpyFu endpoint path or absolute URL (for advanced usage).',
    },
    customMethod: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'HTTP method for the custom endpoint.',
    },
    countryCode: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'SpyFu country code (US, UK, DE, etc.) appended as `countryCode` query parameter.',
    },
    queryParamsTable: {
      type: 'json',
      required: false,
      visibility: 'user-only',
      description: 'Key-value pairs converted into query parameters.',
    },
    body: {
      type: 'json',
      required: false,
      visibility: 'user-only',
      description: 'JSON body for POST endpoints such as bulk keyword lookups.',
    },
    apiUsername: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'SpyFu API username (overrides SPYFU_API_USERNAME).',
    },
    apiPassword: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'SpyFu API password (overrides SPYFU_API_PASSWORD).',
    },
  },
  outputs: {
    data: {
      type: 'json',
      description: 'Raw payload returned by the SpyFu API endpoint.',
    },
    status: {
      type: 'number',
      description: 'HTTP status code returned by SpyFu.',
    },
    headers: {
      type: 'json',
      description: 'SpyFu response headers.',
    },
    endpoint: {
      type: 'string',
      description: 'Full SpyFu endpoint URL used for the request.',
    },
    method: {
      type: 'string',
      description: 'HTTP method used for the SpyFu request.',
    },
  },
  request: {
    url: (params) => prepareRequest(params).url,
    method: (params) => prepareRequest(params).method,
    headers: (params) => prepareRequest(params).headers,
    body: (params) => {
      const prepared = prepareRequest(params)
      if (prepared.method === 'GET' || prepared.method === 'HEAD') {
        return undefined
      }
      return prepared.body
    },
  },
  transformResponse: async (response: Response, params?: SpyfuRequestParams) => {
    const prepared = prepareRequest(params ?? {})

    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })

    const contentType = response.headers.get('content-type') || ''
    const isJson = contentType.includes('json')
    const payload = isJson ? await response.json() : await response.text()

    if (!response.ok) {
      logger.error('SpyFu API request failed', {
        status: response.status,
        endpoint: prepared.url,
        body: payload,
      })

      const message =
        (isJson && (payload?.message || payload?.error)) ||
        (typeof payload === 'string' && payload) ||
        'SpyFu API request failed'

      return {
        success: false,
        error: message,
        output: {
          status: response.status,
          data: payload,
          headers,
          endpoint: prepared.url,
          method: prepared.method,
          query: prepared.query,
        },
      }
    }

    return {
      success: true,
      output: {
        status: response.status,
        data: payload,
        headers,
        endpoint: prepared.url,
        method: prepared.method,
        query: prepared.query,
      },
    }
  },
}

