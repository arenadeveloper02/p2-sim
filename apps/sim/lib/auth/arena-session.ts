import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { env } from '@/lib/core/config/env'

const logger = createLogger('ArenaSession')

/**
 * Shared password used by Arena hub → agent auto-login (same value as the
 * client AutoLoginProvider / deployed-chat flows).
 */
export const ARENA_SHARED_SIGN_IN_PASSWORD = 'Position2!'

interface ArenaAuthUserResponse {
  authenticated?: boolean
  email?: string | null
  errorMessage?: string | null
}

export type ArenaTokenValidationResult =
  | { ok: true; email: string }
  | { ok: false; status: number; error: string }

/**
 * Normalizes an incoming Authorization / Authorisation header value to the raw
 * Arena JWT (strips an optional `Bearer ` prefix).
 */
export function extractArenaToken(headerValue: string): string {
  const trimmed = headerValue.trim()
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    return trimmed.slice('bearer '.length).trim()
  }
  return trimmed
}

/**
 * Picks the Arena token from either standard or Arena-spelled auth headers.
 */
export function resolveArenaTokenFromHeaders(headers: {
  authorization?: string
  authorisation?: string
}): string | null {
  const raw = headers.authorization?.trim() || headers.authorisation?.trim()
  if (!raw) return null
  const token = extractArenaToken(raw)
  return token || null
}

/**
 * Validates an Arena JWT against `/sol/v1/auth/user` and returns the email when
 * authenticated.
 */
export async function validateArenaAuthToken(
  token: string,
  signal?: AbortSignal
): Promise<ArenaTokenValidationResult> {
  const baseUrl = env.ARENA_BACKEND_BASE_URL?.replace(/\/$/, '')
  if (!baseUrl) {
    logger.error('ARENA_BACKEND_BASE_URL is not configured')
    return { ok: false, status: 500, error: 'Arena backend is not configured' }
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}/sol/v1/auth/user`, {
      method: 'GET',
      headers: {
        Authorisation: token,
        Accept: 'application/json',
      },
      signal,
    })
  } catch (error) {
    logger.error('Failed to reach Arena auth user endpoint', {
      error: getErrorMessage(error),
    })
    return { ok: false, status: 502, error: 'Failed to validate Arena token' }
  }

  let payload: ArenaAuthUserResponse
  try {
    payload = (await response.json()) as ArenaAuthUserResponse
  } catch {
    logger.warn('Arena auth user endpoint returned non-JSON', { status: response.status })
    return { ok: false, status: 502, error: 'Invalid response from Arena auth' }
  }

  if (!response.ok || !payload.authenticated || !payload.email?.trim()) {
    logger.warn('Arena token rejected', {
      status: response.status,
      authenticated: payload.authenticated,
      errorMessage: payload.errorMessage,
    })
    return {
      ok: false,
      status: 401,
      error: payload.errorMessage?.trim() || 'Invalid or expired Arena token',
    }
  }

  return { ok: true, email: payload.email.trim().toLowerCase() }
}
