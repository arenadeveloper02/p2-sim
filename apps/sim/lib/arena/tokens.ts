import { db } from '@sim/db'
import { userArenaDetails } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { env, getEnv } from '@/lib/core/config/env'
import { decryptSecret, encryptSecret } from '@/lib/core/security/encryption'

const logger = createLogger('ArenaTokens')

/** In-flight refresh coalescing per Sim user id. */
const refreshInFlight = new Map<string, Promise<string | null>>()

export function arenaBackendBaseUrl(): string {
  const fromServer = env.ARENA_BACKEND_BASE_URL?.trim()
  const fromPublic = getEnv('NEXT_PUBLIC_ARENA_BACKEND_BASE_URL')?.trim()
  const base = fromServer || fromPublic
  if (!base) {
    throw new Error('ARENA_BACKEND_BASE_URL is not configured')
  }
  return base.replace(/\/$/, '')
}

export type ArenaTokenPair = {
  accessToken: string
  refreshToken: string
}

/**
 * Normalizes Arena SSO redeem / refresh payloads that may use `token` or `accessToken`.
 */
export function parseArenaTokenPair(payload: unknown): ArenaTokenPair | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const accessToken =
    typeof record.accessToken === 'string'
      ? record.accessToken.trim()
      : typeof record.token === 'string'
        ? record.token.trim()
        : ''
  const refreshToken = typeof record.refreshToken === 'string' ? record.refreshToken.trim() : ''
  if (!accessToken || !refreshToken) return null
  return { accessToken, refreshToken }
}

/**
 * Persists a short-lived access JWT and encrypted refresh token for the Sim user.
 * Creates a `user_arena_details` row when SSO succeeds before Airbyte has synced one.
 */
export async function persistArenaTokens(
  userId: string,
  accessToken: string,
  refreshToken: string
): Promise<void> {
  const encryptedRefresh = (await encryptSecret(refreshToken)).encrypted
  const updated = await db
    .update(userArenaDetails)
    .set({
      arenaToken: accessToken,
      arenaRefreshToken: encryptedRefresh,
    })
    .where(eq(userArenaDetails.userIdRef, userId))
    .returning({ userIdRef: userArenaDetails.userIdRef })

  if (updated.length === 0) {
    await db.insert(userArenaDetails).values({
      userIdRef: userId,
      arenaToken: accessToken,
      arenaRefreshToken: encryptedRefresh,
    })
  }

  logger.info('Persisted Arena access + refresh tokens', { userId })
}

/** Clears stored Arena tokens (refresh revoked / logout / reconnect required). */
export async function clearArenaTokens(userId: string): Promise<void> {
  await db
    .update(userArenaDetails)
    .set({
      arenaToken: null,
      arenaRefreshToken: null,
    })
    .where(eq(userArenaDetails.userIdRef, userId))
  logger.info('Cleared Arena tokens', { userId })
}

type StoredArenaCreds = {
  accessToken: string | null
  encryptedRefresh: string | null
}

async function loadStoredArenaCreds(userId: string): Promise<StoredArenaCreds | null> {
  const rows = await db
    .select({
      accessToken: userArenaDetails.arenaToken,
      encryptedRefresh: userArenaDetails.arenaRefreshToken,
    })
    .from(userArenaDetails)
    .where(eq(userArenaDetails.userIdRef, userId))
    .limit(1)

  if (rows.length === 0) return null
  return {
    accessToken: rows[0].accessToken ?? null,
    encryptedRefresh: rows[0].encryptedRefresh ?? null,
  }
}

/**
 * Returns a usable Arena access token. Uses the stored access JWT when present;
 * otherwise refreshes via the encrypted refresh token.
 */
export async function getValidArenaAccessToken(userId: string): Promise<string | null> {
  const stored = await loadStoredArenaCreds(userId)
  if (!stored) return null
  if (stored.accessToken) return stored.accessToken
  if (stored.encryptedRefresh) return refreshArenaAccessToken(userId)
  return null
}

/**
 * Calls Arena `POST /sol/v2/users/refresh-token`, rotates stored tokens, returns new access.
 * Coalesces concurrent refreshes for the same user. Clears tokens on hard failure.
 */
export async function refreshArenaAccessToken(userId: string): Promise<string | null> {
  const existing = refreshInFlight.get(userId)
  if (existing) return existing

  const promise = doRefreshArenaAccessToken(userId).finally(() => {
    refreshInFlight.delete(userId)
  })
  refreshInFlight.set(userId, promise)
  return promise
}

async function doRefreshArenaAccessToken(userId: string): Promise<string | null> {
  const stored = await loadStoredArenaCreds(userId)
  if (!stored?.encryptedRefresh) {
    logger.warn('Arena refresh skipped: no refresh token', { userId })
    return null
  }

  let refreshToken: string
  try {
    refreshToken = (await decryptSecret(stored.encryptedRefresh)).decrypted
  } catch {
    logger.error('Arena refresh token decrypt failed', { userId })
    await clearArenaTokens(userId)
    return null
  }

  try {
    const response = await fetch(`${arenaBackendBaseUrl()}/sol/v2/users/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    })

    if (!response.ok) {
      logger.warn('Arena refresh-token request failed', { userId, status: response.status })
      if (response.status === 401 || response.status === 403) {
        await clearArenaTokens(userId)
      }
      return null
    }

    const pair = parseArenaTokenPair(await response.json())
    if (!pair) {
      logger.warn('Arena refresh-token returned incomplete payload', { userId })
      return null
    }

    await persistArenaTokens(userId, pair.accessToken, pair.refreshToken)
    return pair.accessToken
  } catch (error) {
    logger.error('Arena refresh-token request errored', { userId, error })
    return null
  }
}
