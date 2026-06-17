import { createLogger } from '@sim/logger'
import { getErrorMessage, toError } from '@sim/utils/errors'
import type { BillingUpdateCostBody } from '@/lib/api/contracts/subscription'
import { env } from '@/lib/core/config/env'
import { getInternalApiBaseUrl } from '@/lib/core/utils/urls'

const logger = createLogger('CopilotStreamBilling')

export type CopilotStreamBillingSource = BillingUpdateCostBody['source']

/**
 * Maps the Go route for this mothership request to the `source` field on
 * `POST /api/billing/update-cost`.
 */
export function resolveCopilotBillingSourceFromGoRoute(
  goRoute: string
): CopilotStreamBillingSource {
  if (goRoute.startsWith('/api/mothership/execute')) {
    return 'mothership_block'
  }
  if (goRoute.startsWith('/api/mothership')) {
    return 'workspace-chat'
  }
  return 'copilot'
}

export interface PostStreamBillingUpdateCostInput {
  userId: string
  workspaceId?: string
  messageId: string
  goRoute: string
  model?: string
  cost: number
  inputTokens?: number
  outputTokens?: number
}

/**
 * Mirrors the Go mothership billing callback by POSTing to
 * `/api/billing/update-cost` when Sim receives a stream `complete` event.
 */
export async function postStreamBillingUpdateCost(
  input: PostStreamBillingUpdateCostInput
): Promise<void> {
  const secret = env.INTERNAL_API_SECRET
  if (!secret) {
    logger.warn('Skipping stream billing update: INTERNAL_API_SECRET is not configured')
    return
  }

  if (input.cost <= 0) {
    return
  }

  const body: BillingUpdateCostBody = {
    userId: input.userId,
    cost: input.cost,
    model: input.model?.trim() || 'mothership',
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    source: resolveCopilotBillingSourceFromGoRoute(input.goRoute),
    idempotencyKey: `${input.messageId}-billing`,
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
  }

  const url = `${getInternalApiBaseUrl()}/api/billing/update-cost`

  try {
    // boundary-raw-fetch: server-side self-call to the same internal billing route Go uses
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': secret,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      logger.warn('Stream billing update-cost request failed', {
        status: response.status,
        messageId: input.messageId,
        userId: input.userId,
        source: body.source,
        error: errorBody.slice(0, 500),
      })
    }
  } catch (error) {
    logger.warn('Stream billing update-cost request errored', {
      messageId: input.messageId,
      userId: input.userId,
      error: getErrorMessage(error),
      cause: toError(error).message,
    })
  }
}
