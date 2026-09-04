import { createHash } from 'crypto'
import { createLogger } from '@sim/logger'
import { getRedisClient } from '@/lib/core/config/redis'

const logger = createLogger('AdsQueryCache')

/**
 * How long a cached ads query response lives (30 minutes). Long enough for
 * a typical analytics chat session; short enough that same-day ads data
 * does not go stale. Follow-ups like "now chart that" stay inside this window.
 */
const CACHE_TTL_SECONDS = 1800

const KEY_PREFIX = 'ads-query'

export type AdsQueryChannel = 'google' | 'bing' | 'facebook'

/**
 * Identity of one ads query. Every field that can change the response must be
 * here; anything else (request IDs, timestamps) must not be.
 */
export interface AdsQueryCacheParts {
  workspaceId?: string
  accountKey: string
  question: string
  /** Channel-specific extras that affect results (e.g. Facebook date_preset). */
  extra?: Record<string, string | undefined>
}

/** Lowercase + collapse whitespace so trivial rephrasings of the same question hit. */
function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Deterministic key for one (channel, workspace, account, question) on one
 * calendar day. The current date is part of the key so relative ranges like
 * "last 7 days" can never serve yesterday's window after midnight, even
 * within the TTL.
 */
export function buildAdsQueryCacheKey(channel: AdsQueryChannel, parts: AdsQueryCacheParts): string {
  const extras = Object.keys(parts.extra ?? {})
    .sort()
    .map((key) => `${key}=${normalize(parts.extra?.[key] ?? '')}`)
    .join('&')

  const identity = [
    `workspace=${normalize(parts.workspaceId ?? '')}`,
    `account=${normalize(parts.accountKey)}`,
    `question=${normalize(parts.question)}`,
    `extra=${extras}`,
    `date=${new Date().toISOString().slice(0, 10)}`,
  ].join('|')

  const digest = createHash('sha256').update(identity).digest('hex')
  return `${KEY_PREFIX}:${channel}:${digest}`
}

/**
 * Returns the cached response for this query, or null on miss. Never throws:
 * when Redis is unconfigured or unreachable the caller proceeds exactly as if
 * there were no cache.
 */
export async function getCachedAdsQuery<T = Record<string, unknown>>(
  channel: AdsQueryChannel,
  parts: AdsQueryCacheParts
): Promise<T | null> {
  try {
    const redis = getRedisClient()
    if (!redis) return null

    const raw = await redis.get(buildAdsQueryCacheKey(channel, parts))
    if (!raw) return null

    return JSON.parse(raw) as T
  } catch (error) {
    logger.warn('Ads query cache read failed; continuing without cache', {
      channel,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Stores a successful response. Only call with 200 responses — errors must
 * never be cached. Never throws; a failed write just means the next request
 * recomputes.
 */
export async function setCachedAdsQuery(
  channel: AdsQueryChannel,
  parts: AdsQueryCacheParts,
  response: unknown
): Promise<void> {
  try {
    const redis = getRedisClient()
    if (!redis) return

    await redis.set(
      buildAdsQueryCacheKey(channel, parts),
      JSON.stringify(response),
      'EX',
      CACHE_TTL_SECONDS
    )
  } catch (error) {
    logger.warn('Ads query cache write failed; response not cached', {
      channel,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
