import { sleep } from '@sim/utils/helpers'
import { backoffWithJitter } from '@sim/utils/retry'

const RETRYABLE_DB_ERROR_CODES = new Set([
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '53300',
  '53400',
  '57014',
  '57P01',
  '57P02',
  '57P03',
  '58000',
  '58030',
])

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ENETDOWN',
  'ENETRESET',
  'ENETUNREACH',
  /** postgres.js / Bun socket codes for dead pooled connections */
  'CONNECTION_CLOSED',
  'CONNECT_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
])

const RETRYABLE_APP_ERROR_CODES = new Set([
  'SERVICE_OVERLOADED',
  'RESOURCE_EXHAUSTED',
  'CONNECTION_POOL_EXHAUSTED',
])

const RETRYABLE_MESSAGE_FRAGMENTS = [
  'CONNECTION_CLOSED',
  'connection terminated unexpectedly',
  'Connection terminated unexpectedly',
  'server closed the connection unexpectedly',
  'Client network socket disconnected',
] as const

function getErrorChain(error: unknown): Array<Error & Record<string, unknown>> {
  const chain: Array<Error & Record<string, unknown>> = []
  let current: unknown = error
  for (let depth = 0; depth < 10 && current instanceof Error; depth++) {
    const candidate = current as Error & Record<string, unknown>
    chain.push(candidate)
    current = candidate.cause
  }
  return chain
}

function matchesRetryableMessage(message: string): boolean {
  return RETRYABLE_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment))
}

export function describeRetryableInfrastructureError(
  error: unknown
): Record<string, unknown> | undefined {
  for (const candidate of getErrorChain(error)) {
    const code = typeof candidate.code === 'string' ? candidate.code : undefined
    const errno = typeof candidate.errno === 'string' ? candidate.errno : undefined
    const syscall = typeof candidate.syscall === 'string' ? candidate.syscall : undefined
    const messageMatched = matchesRetryableMessage(candidate.message)

    if (
      (code && RETRYABLE_DB_ERROR_CODES.has(code)) ||
      (code && RETRYABLE_NETWORK_ERROR_CODES.has(code)) ||
      (code && RETRYABLE_APP_ERROR_CODES.has(code)) ||
      (errno && RETRYABLE_NETWORK_ERROR_CODES.has(errno)) ||
      messageMatched
    ) {
      return {
        name: candidate.name,
        message: candidate.message,
        code,
        errno,
        syscall,
      }
    }
  }

  return undefined
}

export function isRetryableInfrastructureError(error: unknown): boolean {
  return Boolean(describeRetryableInfrastructureError(error))
}

export interface InfrastructureRetryOptions {
  /** Total attempts including the first try. Defaults to 5. */
  maxAttempts?: number
  baseMs?: number
  maxMs?: number
  onRetry?: (params: {
    attempt: number
    maxAttempts: number
    delayMs: number
    error: unknown
  }) => void
}

/**
 * Retries an async operation when {@link isRetryableInfrastructureError} matches.
 * Use for long-running batch scripts that reuse a pooled DB client across pages.
 */
export async function withInfrastructureRetry<T>(
  operation: () => Promise<T>,
  options: InfrastructureRetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5
  const baseMs = options.baseMs ?? 500
  const maxMs = options.maxMs ?? 15_000
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt >= maxAttempts || !isRetryableInfrastructureError(error)) {
        throw error
      }

      const delayMs = backoffWithJitter(attempt, null, { baseMs, maxMs })
      options.onRetry?.({ attempt, maxAttempts, delayMs, error })
      await sleep(delayMs)
    }
  }

  throw lastError
}
