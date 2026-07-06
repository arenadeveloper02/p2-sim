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
