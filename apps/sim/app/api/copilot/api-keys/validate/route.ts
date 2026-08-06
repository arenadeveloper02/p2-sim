import { db } from '@sim/db'
import { user } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { validateCopilotApiKeyContract } from '@/lib/api/contracts/copilot'
import { parseRequest, validationErrorResponse } from '@/lib/api/server'
import {
  checkMothershipUsageLimits,
  checkSelfHostedMothershipUsageLimits,
} from '@/lib/billing/calculations/usage-monitor'
import {
  requireBillingAttributionHeader,
  requireBillingRequestIdHeader,
  resolveLegacyV0BillingAttribution,
  serializeAccountBillingDecisionHeader,
  serializeBillingAttributionHeader,
} from '@/lib/billing/core/billing-attribution'
import { getHighestPrioritySubscription } from '@/lib/billing/core/plan'
import { deriveBillingContext } from '@/lib/billing/core/usage-log'
import {
  BILLING_ACCOUNT_DECISION_HEADER,
  BILLING_ATTRIBUTION_HEADER,
  BILLING_REQUEST_ID_HEADER,
  COPILOT_BILLING_PROTOCOL,
  COPILOT_BILLING_PROTOCOL_HEADER,
  type CopilotBillingProtocol,
} from '@/lib/copilot/generated/billing-protocol-v1'
import { CopilotValidateOutcome } from '@/lib/copilot/generated/trace-attribute-values-v1'
import { TraceAttr } from '@/lib/copilot/generated/trace-attributes-v1'
import { TraceSpan } from '@/lib/copilot/generated/trace-spans-v1'
import { checkInternalApiKey } from '@/lib/copilot/request/http'
import { withIncomingGoSpan } from '@/lib/copilot/request/otel'
import { isCopilotBillingProtocolRequired, isHosted } from '@/lib/core/config/env-flags'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

const logger = createLogger('CopilotApiKeysValidate')

function invalidBillingProtocolResponse(): NextResponse {
  return NextResponse.json({ error: 'Invalid billing attribution protocol' }, { status: 400 })
}

/**
 * Resolves trusted billing response headers without changing the fork's
 * usage-limit decision.
 *
 * The protocol layer is additive: the fork's mothership limit helpers below
 * remain the governing admission check. Markerless legacy traffic is accepted
 * while the protocol-required flag is unset.
 */
async function resolveBillingProtocolResponseHeaders(
  req: NextRequest,
  protocol: CopilotBillingProtocol | undefined,
  actorUserId: string,
  workspaceId: string | undefined
): Promise<Record<string, string> | NextResponse> {
  const hasBillingRequestId = Boolean(req.headers.get(BILLING_REQUEST_ID_HEADER))
  const hasBillingAttribution = Boolean(req.headers.get(BILLING_ATTRIBUTION_HEADER))
  const hasBillingAccountDecision = Boolean(req.headers.get(BILLING_ACCOUNT_DECISION_HEADER))

  if (protocol === COPILOT_BILLING_PROTOCOL.attributed) {
    if (!workspaceId || hasBillingAccountDecision) {
      return invalidBillingProtocolResponse()
    }
    try {
      requireBillingRequestIdHeader(req.headers)
      requireBillingAttributionHeader(req.headers, {
        actorUserId,
        workspaceId,
      })
      const serializedAttribution = req.headers.get(BILLING_ATTRIBUTION_HEADER)
      if (!serializedAttribution) return invalidBillingProtocolResponse()
      return { [BILLING_ATTRIBUTION_HEADER]: serializedAttribution }
    } catch {
      return invalidBillingProtocolResponse()
    }
  }

  if (protocol === COPILOT_BILLING_PROTOCOL.direct) {
    if (hasBillingAttribution || hasBillingAccountDecision) {
      return invalidBillingProtocolResponse()
    }

    try {
      requireBillingRequestIdHeader(req.headers)
    } catch {
      return invalidBillingProtocolResponse()
    }

    const subscription = await getHighestPrioritySubscription(actorUserId, {
      onError: 'throw',
    })
    const billingContext = deriveBillingContext(actorUserId, subscription)
    return {
      [BILLING_ACCOUNT_DECISION_HEADER]: serializeAccountBillingDecisionHeader({
        userId: actorUserId,
        billingEntity: billingContext.billingEntity,
        billingPeriod: {
          start: billingContext.billingPeriod.start.toISOString(),
          end: billingContext.billingPeriod.end.toISOString(),
        },
      }),
    }
  }

  if (protocol !== undefined && protocol !== COPILOT_BILLING_PROTOCOL.legacy) {
    return invalidBillingProtocolResponse()
  }

  if (protocol === undefined && isCopilotBillingProtocolRequired) {
    return invalidBillingProtocolResponse()
  }

  if (hasBillingRequestId || hasBillingAttribution || hasBillingAccountDecision) {
    return invalidBillingProtocolResponse()
  }
  if (protocol === COPILOT_BILLING_PROTOCOL.legacy && !workspaceId) {
    return invalidBillingProtocolResponse()
  }

  if (workspaceId) {
    const attribution = await resolveLegacyV0BillingAttribution({
      actorUserId,
      workspaceId,
    })
    if (attribution) {
      return protocol === COPILOT_BILLING_PROTOCOL.legacy
        ? { [BILLING_ATTRIBUTION_HEADER]: serializeBillingAttributionHeader(attribution) }
        : {}
    }
  }

  return {}
}

/**
 * Incoming-from-Go: extracts traceparent so this handler's work shows up as
 * a child of the Go-side `sim.validate_api_key` span in the same trace. If
 * there's no traceparent (manual curl / browser), the helper falls back to a
 * new root span.
 */
export const POST = withRouteHandler((req: NextRequest) =>
  withIncomingGoSpan(
    req.headers,
    TraceSpan.CopilotAuthValidateApiKey,
    {
      [TraceAttr.HttpMethod]: 'POST',
      [TraceAttr.HttpRoute]: '/api/copilot/api-keys/validate',
    },
    async (span) => {
      try {
        const auth = checkInternalApiKey(req)
        if (!auth.success) {
          span.setAttribute(
            TraceAttr.CopilotValidateOutcome,
            CopilotValidateOutcome.InternalAuthFailed
          )
          span.setAttribute(TraceAttr.HttpStatusCode, 401)
          return new NextResponse(null, { status: 401 })
        }

        const parsed = await parseRequest(
          validateCopilotApiKeyContract,
          req,
          {},
          {
            validationErrorResponse: (error) => {
              logger.warn('Invalid validation request', { errors: error.issues })
              span.setAttribute(
                TraceAttr.CopilotValidateOutcome,
                CopilotValidateOutcome.InvalidBody
              )
              span.setAttribute(TraceAttr.HttpStatusCode, 400)
              return validationErrorResponse(error, 'userId is required')
            },
            invalidJsonResponse: () => {
              logger.warn('Invalid validation request: invalid JSON')
              span.setAttribute(
                TraceAttr.CopilotValidateOutcome,
                CopilotValidateOutcome.InvalidBody
              )
              span.setAttribute(TraceAttr.HttpStatusCode, 400)
              return NextResponse.json(
                { error: 'userId is required', details: [] },
                { status: 400 }
              )
            },
          }
        )
        if (!parsed.success) return parsed.response

        const { userId, workspaceId } = parsed.data.body
        const protocol = parsed.data.headers?.[COPILOT_BILLING_PROTOCOL_HEADER]
        span.setAttribute(TraceAttr.UserId, userId)

        const [existingUser] = await db.select().from(user).where(eq(user.id, userId)).limit(1)
        if (!existingUser) {
          logger.warn('[API VALIDATION] userId does not exist', { userId })
          span.setAttribute(TraceAttr.CopilotValidateOutcome, CopilotValidateOutcome.UserNotFound)
          span.setAttribute(TraceAttr.HttpStatusCode, 403)
          return NextResponse.json({ error: 'User not found' }, { status: 403 })
        }

        const responseHeaders = await resolveBillingProtocolResponseHeaders(
          req,
          protocol,
          userId,
          workspaceId
        )
        if (responseHeaders instanceof NextResponse) {
          span.setAttribute(TraceAttr.CopilotValidateOutcome, CopilotValidateOutcome.InvalidBody)
          span.setAttribute(TraceAttr.HttpStatusCode, responseHeaders.status)
          return responseHeaders
        }

        logger.info('[API VALIDATION] Validating usage limit', {
          userId,
          workspaceId,
          billingProtocol: protocol ?? COPILOT_BILLING_PROTOCOL.legacy,
        })

        if (!isHosted) {
          const { isExceeded, currentUsage, limit } =
            await checkSelfHostedMothershipUsageLimits(userId)
          span.setAttributes({
            [TraceAttr.BillingUsageCurrent]: currentUsage,
            [TraceAttr.BillingUsageLimit]: limit,
            [TraceAttr.BillingUsageExceeded]: isExceeded,
          })

          logger.info('[API VALIDATION] Usage limit validated', {
            userId,
            currentUsage,
            limit,
            isExceeded,
            selfHostedMothershipOnly: true,
          })

          if (isExceeded) {
            logger.info('[API VALIDATION] Usage exceeded', { userId, currentUsage, limit })
            span.setAttribute(
              TraceAttr.CopilotValidateOutcome,
              CopilotValidateOutcome.UsageExceeded
            )
            span.setAttribute(TraceAttr.HttpStatusCode, 402)
            return new NextResponse(null, { status: 402 })
          }
        } else {
          const usage = await checkMothershipUsageLimits(userId, workspaceId)
          span.setAttribute(TraceAttr.BillingUsageExceeded, usage.isExceeded)

          logger.info('[API VALIDATION] Hosted mothership usage validated', {
            userId,
            workspaceId,
            isExceeded: usage.isExceeded,
            scope: usage.scope,
          })

          if (usage.isExceeded) {
            logger.info('[API VALIDATION] Usage exceeded', {
              userId,
              workspaceId,
              scope: usage.scope,
            })
            span.setAttribute(
              TraceAttr.CopilotValidateOutcome,
              CopilotValidateOutcome.UsageExceeded
            )
            span.setAttribute(TraceAttr.HttpStatusCode, 402)
            return new NextResponse(null, { status: 402 })
          }
        }
        span.setAttribute(TraceAttr.CopilotValidateOutcome, CopilotValidateOutcome.Ok)
        span.setAttribute(TraceAttr.HttpStatusCode, 200)
        return new NextResponse(null, { status: 200, headers: responseHeaders })
      } catch (error) {
        logger.error('Error validating usage limit', { error })
        span.setAttribute(TraceAttr.CopilotValidateOutcome, CopilotValidateOutcome.InternalError)
        span.setAttribute(TraceAttr.HttpStatusCode, 500)
        return NextResponse.json({ error: 'Failed to validate usage' }, { status: 500 })
      }
    }
  )
)
