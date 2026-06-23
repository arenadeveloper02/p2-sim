import { env } from '@/lib/core/config/env'

/** HTTP statuses that trigger failover to the next configured copilot API key. */
const COPILOT_API_KEY_FAILOVER_STATUSES = new Set([401, 403, 429, 502, 503, 504])

/**
 * Returns configured Sim → Mothership API keys in failover order.
 * `COPILOT_API_KEY` is primary; `COPILOT_API_KEY_2` is the optional backup.
 */
export function listCopilotApiKeys(): string[] {
  const keys: string[] = []
  const primary = env.COPILOT_API_KEY?.trim()
  const secondary = env.COPILOT_API_KEY_2?.trim()

  if (primary) keys.push(primary)
  if (secondary && secondary !== primary) keys.push(secondary)

  return keys
}

export function hasCopilotApiKey(): boolean {
  return listCopilotApiKeys().length > 0
}

export function isCopilotApiKeyFailoverStatus(status: number): boolean {
  return COPILOT_API_KEY_FAILOVER_STATUSES.has(status)
}

/**
 * Returns true for transient network failures where retrying with the next key
 * may succeed (same Mothership URL, different account credentials).
 */
export function isCopilotApiKeyFailoverNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (error instanceof DOMException && error.name === 'AbortError') return false
  return false
}

/**
 * Returns true when the outbound request carries a copilot `x-api-key` header,
 * indicating Sim → Mothership auth where key failover should apply.
 */
export function requestUsesCopilotApiKey(headers: Record<string, string>): boolean {
  const apiKey = headers['x-api-key']
  return typeof apiKey === 'string' && apiKey.length > 0
}

/**
 * Strips any caller-provided `x-api-key` so failover owns auth exclusively.
 */
export function stripCopilotApiKeyHeader(
  headers: Record<string, string> | undefined
): Record<string, string> {
  if (!headers) return {}
  const { 'x-api-key': _removed, ...rest } = headers
  return rest
}
