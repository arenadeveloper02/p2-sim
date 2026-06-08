import { createLogger } from '@sim/logger'
import { getRedisClient } from '@/lib/core/config/redis'

const logger = createLogger('GoogleAdsCache')
const CACHE_TTL_SECONDS = 600 // 10 minutes

/**
 * Generate cache key from query parameters
 */
function generateCacheKey(query: string, accountId: string, dateRange?: string): string {
  return `google-ads:${query}:${accountId}:${dateRange || 'default'}`
}

/**
 * Get cached result from Redis if available
 */
export async function getCachedResult(
  query: string,
  accountId: string,
  dateRange?: string
): Promise<unknown | null> {
  const redis = getRedisClient()
  if (!redis) {
    logger.info('Redis not available, skipping cache')
    return null
  }

  const key = generateCacheKey(query, accountId, dateRange)
  logger.info('Checking cache', { key })
  try {
    const cached = await redis.get(key)
    if (cached) {
      logger.info('Cache hit', { key })
      return JSON.parse(cached)
    }
    logger.info('Cache miss', { key })
    return null
  } catch (error) {
    logger.error('Cache get failed', { key, error })
    return null
  }
}

/**
 * Store result in Redis cache
 */
export async function setCachedResult(
  query: string,
  accountId: string,
  data: unknown,
  dateRange?: string
): Promise<void> {
  const redis = getRedisClient()
  if (!redis) {
    logger.info('Redis not available, skipping cache set')
    return
  }

  const key = generateCacheKey(query, accountId, dateRange)
  try {
    await redis.set(key, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS)
    logger.info('Cache set', { key })
  } catch (error) {
    logger.error('Cache set failed', { key, error })
  }
}
