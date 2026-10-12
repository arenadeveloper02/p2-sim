import { createLogger } from '@sim/logger'
import {
  arenaBackendBaseUrl,
  getValidArenaAccessToken,
  refreshArenaAccessToken,
} from '@/lib/arena/tokens'

const logger = createLogger('ArenaFetch')

export class ArenaAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArenaAuthError'
  }
}

function resolveArenaUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const base = arenaBackendBaseUrl()
  return pathOrUrl.startsWith('/') ? `${base}${pathOrUrl}` : `${base}/${pathOrUrl}`
}

/**
 * Authenticated fetch against the Arena (sol) API.
 * Sets `authorisation` from the user's stored access token; on 401 refreshes once and retries.
 */
export async function arenaFetch(
  userId: string,
  pathOrUrl: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = resolveArenaUrl(pathOrUrl)
  let accessToken = await getValidArenaAccessToken(userId)
  if (!accessToken) {
    throw new ArenaAuthError('Arena token not found for user — reconnect via Arena SSO')
  }

  const headers = new Headers(init.headers)
  headers.set('authorisation', accessToken)

  let response = await fetch(url, { ...init, headers, cache: init.cache ?? 'no-store' })
  if (response.status !== 401) {
    return response
  }

  logger.info('Arena request returned 401; refreshing access token', { userId })
  accessToken = await refreshArenaAccessToken(userId)
  if (!accessToken) {
    throw new ArenaAuthError('Arena session expired — reconnect via Arena SSO')
  }

  headers.set('authorisation', accessToken)
  response = await fetch(url, { ...init, headers, cache: init.cache ?? 'no-store' })
  return response
}
