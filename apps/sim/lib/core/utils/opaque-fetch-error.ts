import { getErrorMessage, toError } from '@sim/utils/errors'

/**
 * True when undici (or a wrapper) hid a socket/header timeout behind opaque
 * `fetch failed`. The real reason lives on `error.cause`.
 */
export function isOpaqueFetchFailed(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  const cause =
    error instanceof Error && error.cause != null
      ? getErrorMessage(error.cause, '').toLowerCase()
      : ''
  const combined = `${message} ${cause}`
  return (
    combined.includes('fetch failed') ||
    combined.includes('headers timeout') ||
    combined.includes('body timeout') ||
    combined.includes('und_err_headers_timeout') ||
    combined.includes('und_err_body_timeout') ||
    combined.includes('und_err_connect_timeout')
  )
}

/**
 * Rewrites undici's opaque `TypeError: fetch failed` into a message that names
 * the underlying cause and the AbortController ceiling the caller intended.
 */
export function formatInternalToolFetchError(error: unknown, timeoutMs: number): Error {
  if (!isOpaqueFetchFailed(error)) {
    return toError(error)
  }

  const message = getErrorMessage(error, 'fetch failed')
  const cause =
    error instanceof Error && error.cause != null ? getErrorMessage(error.cause, '') : ''
  const detail = [cause, message].find(
    (part) => part.length > 0 && part.toLowerCase() !== 'fetch failed'
  )
  const reason = detail || 'connection closed or timed out'
  return new Error(
    `Internal tool request failed (${reason}). The HTTP client gave up before the tool finished (limit ${timeoutMs}ms). Retry the run.`
  )
}

/**
 * Same unwrap for provider SDK fetches (Anthropic, etc.) that surface as
 * `fetch failed` with no useful message.
 */
export function formatProviderNetworkError(error: unknown, fallback: string): string {
  const message = getErrorMessage(error, fallback)
  if (!isOpaqueFetchFailed(error)) {
    return message
  }
  const cause =
    error instanceof Error && error.cause != null ? getErrorMessage(error.cause, '') : ''
  const detail = [cause, message].find(
    (part) => part.length > 0 && part.toLowerCase() !== 'fetch failed'
  )
  return detail
    ? `Model request failed: ${detail}`
    : 'Model request failed (connection closed or timed out). Retry the run.'
}
