import { env } from '@/lib/core/config/env'

const DEFAULT_SKYVERN_BASE_URL = 'https://api.skyvern.com'
const DEFAULT_SKYVERN_AGENTS_API_PATH = '/v1/agents'
const DEFAULT_SKYVERN_RUN_AGENTS_API_PATH = '/v1/run/agents'
const DEFAULT_SKYVERN_RUNS_API_PATH = '/v1/runs'

/**
 * Normalizes a Skyvern server base URL by trimming whitespace and trailing slashes.
 */
export function normalizeSkyvernBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

/**
 * Resolves the Skyvern API key from block params or server environment.
 */
export function resolveSkyvernApiKey(paramsApiKey?: string): string {
  const fromBlock = paramsApiKey?.trim()
  if (fromBlock) return fromBlock
  return env.SKYVERN_API_KEY?.trim() ?? ''
}

/**
 * Resolves the Skyvern API base URL from block params, server environment, or the cloud default.
 */
export function resolveSkyvernBaseUrl(paramsBaseUrl?: string): string {
  const fromBlock = paramsBaseUrl?.trim()
  if (fromBlock) return normalizeSkyvernBaseUrl(fromBlock)
  const fromEnv = env.SKYVERN_BASE_URL?.trim()
  if (fromEnv) return normalizeSkyvernBaseUrl(fromEnv)
  return DEFAULT_SKYVERN_BASE_URL
}

/**
 * Returns a Skyvern API key or throws when neither the block nor env provides one.
 */
export function requireSkyvernApiKey(paramsApiKey?: string): string {
  const apiKey = resolveSkyvernApiKey(paramsApiKey)
  if (!apiKey) {
    throw new Error(
      'Skyvern API key is required. Enter it in the block or set SKYVERN_API_KEY in the server environment.'
    )
  }
  return apiKey
}

/**
 * Resolves the agents API path used to create and list workflows (OpenAPI: GET/POST /v1/agents).
 */
export function resolveSkyvernAgentsApiPath(): string {
  const fromEnv = env.SKYVERN_WORKFLOWS_API_PATH?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  return DEFAULT_SKYVERN_AGENTS_API_PATH
}

/**
 * Resolves the run-agents API path used to trigger workflow runs (OpenAPI: POST /v1/run/agents).
 */
export function resolveSkyvernRunAgentsApiPath(): string {
  const fromEnv = env.SKYVERN_RUN_AGENTS_API_PATH?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  return DEFAULT_SKYVERN_RUN_AGENTS_API_PATH
}

/**
 * Resolves the runs API path used to fetch run status (OpenAPI: GET /v1/runs/{run_id}).
 */
export function resolveSkyvernRunsApiPath(): string {
  const fromEnv = env.SKYVERN_RUNS_API_PATH?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  return DEFAULT_SKYVERN_RUNS_API_PATH
}

/**
 * Builds a full Skyvern API URL from a base URL and path segment.
 */
export function buildSkyvernUrl(baseUrl: string, path: string): string {
  const base = normalizeSkyvernBaseUrl(baseUrl)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalizedPath}`
}
