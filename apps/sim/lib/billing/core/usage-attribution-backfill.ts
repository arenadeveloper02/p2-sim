import {
  buildModelPricingSnapshot,
  normalizeUsageModelId,
  normalizeUsageToolId,
} from '@/lib/billing/core/usage-entry-normalize'
import { getProviderFromModel } from '@/providers/models'

/** Triggers treated as direct human actors during cheap historical backfill. */
export const HUMAN_ACTOR_TRIGGERS = ['manual', 'chat', 'copilot'] as const

export type HumanActorTrigger = (typeof HUMAN_ACTOR_TRIGGERS)[number]

export type BackfillActorType = 'user' | 'api_key' | 'webhook' | 'schedule'

export interface BackfillActorFields {
  actorType: BackfillActorType
  actorUserId: string | null
}

/**
 * Cheap actor heuristic for pre-cutover rows. Human triggers copy `user_id`;
 * api/webhook/schedule set `actor_type` only (no enabler resolution).
 */
export function resolveBackfillActorFromTrigger(
  trigger: string,
  userId: string | null | undefined
): BackfillActorFields | null {
  if (HUMAN_ACTOR_TRIGGERS.includes(trigger as HumanActorTrigger)) {
    if (!userId || userId === 'unknown') {
      return null
    }
    return { actorType: 'user', actorUserId: userId }
  }

  if (trigger === 'api') {
    return { actorType: 'api_key', actorUserId: null }
  }
  if (trigger === 'webhook') {
    return { actorType: 'webhook', actorUserId: null }
  }
  if (trigger === 'schedule') {
    return { actorType: 'schedule', actorUserId: null }
  }

  return null
}

export interface UsageLogNormalizationInput {
  category: string
  description: string
  provider: string | null
  toolId: string | null
  metadata: unknown
  pricingSnapshot: unknown
}

export interface UsageLogNormalizationResult {
  description: string
  provider: string | null
  toolId: string | null
  pricingSnapshot: Record<string, unknown> | null
}

function readMetadataModel(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const model = (metadata as { model?: unknown }).model
  return typeof model === 'string' && model.trim().length > 0 ? model : null
}

function readPricingSnapshotModel(pricingSnapshot: unknown): string | null {
  if (!pricingSnapshot || typeof pricingSnapshot !== 'object') return null
  const model = (pricingSnapshot as { model?: unknown }).model
  return typeof model === 'string' && model.trim().length > 0 ? model : null
}

/** Picks the best model identifier from legacy usage_log fields. */
export function resolveModelIdentifierForBackfill(
  description: string,
  metadata: unknown,
  pricingSnapshot: unknown
): string {
  return (
    readMetadataModel(metadata) ??
    readPricingSnapshotModel(pricingSnapshot) ??
    description
  )
}

/**
 * Computes normalized provider/tool/model fields for a legacy usage_log row.
 * Returns `null` when the row is already normalized or not a model/tool row.
 */
export function normalizeUsageLogRowForBackfill(
  row: UsageLogNormalizationInput
): UsageLogNormalizationResult | null {
  if (row.category === 'model') {
    const sourceModel = resolveModelIdentifierForBackfill(
      row.description,
      row.metadata,
      row.pricingSnapshot
    )
    const canonicalModel = normalizeUsageModelId(sourceModel)
    const provider = row.provider ?? getProviderFromModel(canonicalModel)
    const pricingSnapshot =
      (row.pricingSnapshot as Record<string, unknown> | null) ??
      buildModelPricingSnapshot(canonicalModel)

    const normalizedSnapshot = {
      ...pricingSnapshot,
      model: canonicalModel,
    }

    const unchanged =
      row.description === canonicalModel &&
      row.provider === provider &&
      row.pricingSnapshot != null &&
      readPricingSnapshotModel(row.pricingSnapshot) === canonicalModel

    if (unchanged) {
      return null
    }

    return {
      description: canonicalModel,
      provider,
      toolId: row.toolId,
      pricingSnapshot: normalizedSnapshot,
    }
  }

  if (row.category === 'tool') {
    const sourceTool = row.toolId ?? row.description
    const canonicalTool = normalizeUsageToolId(sourceTool)
    if (row.description === canonicalTool && row.toolId === canonicalTool) {
      return null
    }

    return {
      description: canonicalTool,
      provider: row.provider,
      toolId: canonicalTool,
      pricingSnapshot: null,
    }
  }

  return null
}

/** Matches `/api/billing/update-cost` idempotency keys: `update-cost:{messageId}-billing`. */
const UPDATE_COST_BILLING_EVENT_KEY =
  /^update-cost:(.+)-billing$/

/**
 * Extracts the mothership/copilot message (stream) id from an update-cost event key.
 * Returns null when the key is not an update-cost billing key.
 */
export function parseUpdateCostBillingMessageId(
  eventKey: string | null | undefined
): string | null {
  if (!eventKey) return null
  const match = UPDATE_COST_BILLING_EVENT_KEY.exec(eventKey.trim())
  const messageId = match?.[1]?.trim()
  return messageId && messageId.length > 0 ? messageId : null
}

/**
 * Extracts a mothership chat id from Arena Copilot source references of the form
 * `arena-copilot:{chatId}:round-N`. Historical `local-copilot:*` refs are not recoverable
 * this way (chat id was never embedded).
 */
export function parseArenaCopilotChatIdFromSourceReference(
  sourceReference: string | null | undefined
): string | null {
  if (!sourceReference) return null
  const match = /^arena-copilot:([0-9a-f-]{36}):round-\d+$/i.exec(sourceReference.trim())
  return match?.[1] ?? null
}

/** Copilot/mothership sources that should carry usage_log.chat_id for Usage joins. */
export const MOTHERSHIP_CHAT_ATTRIBUTION_SOURCES = [
  'copilot',
  'workspace-chat',
  'mcp_copilot',
  'mothership_block',
] as const

