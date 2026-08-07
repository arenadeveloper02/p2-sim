import { getErrorMessage, toError } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'
import { backoffWithJitter } from '@sim/utils/retry'

const MAX_NETWORK_RETRIES = 2

/**
 * True for transient outbound network failures (not auth / abort).
 */
export function isTransientProviderNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return false
  if (error instanceof Error && error.name === 'AbortError') return false
  if (typeof error === 'object' && error && 'name' in error && error.name === 'AbortError') {
    return false
  }

  const message = getErrorMessage(error, '').toLowerCase()
  const cause =
    error instanceof Error && error.cause != null ? getErrorMessage(error.cause, '') : ''
  const combined = `${message} ${cause}`.toLowerCase()

  return (
    combined.includes('fetch failed') ||
    combined.includes('etimedout') ||
    combined.includes('econnreset') ||
    combined.includes('econnrefused') ||
    combined.includes('socket hang up') ||
    combined.includes('network') ||
    combined.includes('und_err')
  )
}

/**
 * Rewrites opaque undici `fetch failed` errors to include the underlying cause
 * (e.g. connect ETIMEDOUT) so orchestration logs are actionable.
 */
export function formatProviderFetchError(error: unknown, context: string): Error {
  const base = getErrorMessage(error, context)
  const cause =
    error instanceof Error && error.cause != null ? getErrorMessage(error.cause, '') : ''

  if (base.toLowerCase() === 'fetch failed' || base.toLowerCase().includes('fetch failed')) {
    if (cause) {
      return new Error(`${context}: ${cause}`)
    }
    return new Error(
      `${context}: network request failed (check connectivity to the model provider)`
    )
  }

  return toError(error)
}

/**
 * Performs a provider fetch with a couple of retries on transient network errors.
 */
export async function fetchProviderWithRetry(
  input: string,
  init: RequestInit,
  context: string
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_NETWORK_RETRIES + 1; attempt++) {
    try {
      return await fetch(input, init)
    } catch (error) {
      lastError = error
      if (
        attempt > MAX_NETWORK_RETRIES ||
        init.signal?.aborted ||
        !isTransientProviderNetworkError(error)
      ) {
        throw formatProviderFetchError(error, context)
      }
      await sleep(backoffWithJitter(attempt, null, { baseMs: 400, maxMs: 4_000 }))
    }
  }
  throw formatProviderFetchError(lastError, context)
}
