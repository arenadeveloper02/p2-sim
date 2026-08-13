import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { generativeAppSsoContract } from '@/lib/api/contracts/arena-generative-apps'
import { parseRequest } from '@/lib/api/server'
import { findDeployedAppByIdentifier } from '@/lib/arena-generative-ui/deployment'
import type { TokenBucketConfig } from '@/lib/core/rate-limiter'
import { RateLimiter } from '@/lib/core/rate-limiter'
import { isEmailAllowed } from '@/lib/core/security/deployment'
import { generateRequestId, getClientIp } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('DeployedAppSSOAPI')
const rateLimiter = new RateLimiter()
const SSO_IP_RATE_LIMIT: TokenBucketConfig = {
  maxTokens: 20,
  refillRate: 20,
  refillIntervalMs: 15 * 60_000,
}

export const POST = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ identifier: string }> }) => {
    const requestId = generateRequestId()
    const ip = getClientIp(request)
    const ipRateLimit = await rateLimiter.checkRateLimitDirect(
      `app-sso:ip:${ip}`,
      SSO_IP_RATE_LIMIT
    )
    if (!ipRateLimit.allowed) {
      logger.warn(`[${requestId}] SSO eligibility rate limit exceeded from ${ip}`)
      const retryAfter = Math.ceil(
        (ipRateLimit.retryAfterMs ?? SSO_IP_RATE_LIMIT.refillIntervalMs) / 1000
      )
      const response = createErrorResponse('Too many requests. Please try again later.', 429)
      response.headers.set('Retry-After', String(retryAfter))
      return response
    }

    const parsed = await parseRequest(generativeAppSsoContract, request, context)
    if (!parsed.success) return parsed.response

    const deployment = await findDeployedAppByIdentifier(parsed.data.params.identifier)
    if (!deployment || !deployment.isActive) {
      return createErrorResponse('App not found', 404)
    }
    if (deployment.authType !== 'sso') {
      return createErrorResponse('App is not configured for SSO authentication', 400)
    }

    const eligible = isEmailAllowed(
      parsed.data.body.email,
      (deployment.allowedEmails as string[]) || []
    )
    return createSuccessResponse({ eligible })
  }
)
