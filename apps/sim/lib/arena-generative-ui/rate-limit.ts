import type { NextRequest, NextResponse } from 'next/server'
import type { TokenBucketConfig } from '@/lib/core/rate-limiter'
import { RateLimiter } from '@/lib/core/rate-limiter'
import { getClientIp } from '@/lib/core/utils/request'
import { createErrorResponse } from '@/app/api/workflows/utils'

const rateLimiter = new RateLimiter()

/**
 * Per-IP, per-app ceiling on published CTA calls.
 *
 * A published action is an unauthenticated-capable proxy that runs a deployed
 * workflow on the owner's execution quota, or fetches an allowlisted host with the
 * workspace's decrypted secret attached. Without a limit a `public` app with the
 * Arena emailId gate off is an open relay for both.
 *
 * The budget is deliberately generous: a page with several `onLoad` actions plus
 * ordinary clicking should never reach it, so this caps abuse rather than pacing
 * real use. Tune here — it is the only definition.
 */
export const GENERATIVE_APP_ACTION_IP_RATE_LIMIT: TokenBucketConfig = {
  maxTokens: 120,
  refillRate: 120,
  refillIntervalMs: 5 * 60_000,
}

export const GENERATIVE_APP_ACTION_RATE_LIMIT_MESSAGE =
  'Too many requests for this app. Please try again shortly.'

/**
 * Throttles published CTA calls per client IP per app. Returns a 429 with
 * `Retry-After` when the bucket is empty, otherwise `null`.
 *
 * Call this **before** loading the deployment or running auth, so a flood cannot
 * reach Postgres. The bucket key includes the identifier so one app cannot drain
 * another's allowance.
 */
export async function checkGenerativeAppActionRateLimit(
  identifier: string,
  request: NextRequest
): Promise<NextResponse | null> {
  const ip = getClientIp(request)
  const result = await rateLimiter.checkRateLimitDirect(
    `gui-app-action:ip:${identifier}:${ip}`,
    GENERATIVE_APP_ACTION_IP_RATE_LIMIT
  )
  if (result.allowed) {
    return null
  }
  const retryAfterSeconds = Math.ceil(
    (result.retryAfterMs ?? GENERATIVE_APP_ACTION_IP_RATE_LIMIT.refillIntervalMs) / 1000
  )
  const response = createErrorResponse(GENERATIVE_APP_ACTION_RATE_LIMIT_MESSAGE, 429)
  response.headers.set('Retry-After', String(retryAfterSeconds))
  return response
}
