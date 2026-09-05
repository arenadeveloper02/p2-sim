import { subscription as subscriptionTable } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { isArenaBilling } from '@/lib/billing/arena/env'
import { isStarterPlan } from '@/lib/billing/arena/starter-plan'
import { ENTITLED_SUBSCRIPTION_STATUSES } from '@/lib/billing/subscriptions/utils'
import type { DbOrTx } from '@/lib/db/types'

const logger = createLogger('ArenaSupersedeStarter')

export interface SupersedeStarterResult {
  canceledIds: string[]
}

/**
 * Cancels entitled Starter rows on a billing reference after a paid Stripe
 * subscription is created. Keeps the paid row (`exceptSubscriptionId`) intact.
 */
export async function supersedeStarterSubscriptions(
  referenceId: string,
  exceptSubscriptionId: string,
  executor: DbOrTx
): Promise<SupersedeStarterResult> {
  if (!isArenaBilling()) {
    return { canceledIds: [] }
  }

  const starters = await executor
    .select({
      id: subscriptionTable.id,
      plan: subscriptionTable.plan,
    })
    .from(subscriptionTable)
    .where(
      and(
        eq(subscriptionTable.referenceId, referenceId),
        inArray(subscriptionTable.status, ENTITLED_SUBSCRIPTION_STATUSES),
        ne(subscriptionTable.id, exceptSubscriptionId)
      )
    )

  const starterIds = starters.filter((row) => isStarterPlan(row.plan)).map((row) => row.id)
  if (starterIds.length === 0) {
    return { canceledIds: [] }
  }

  const now = new Date()
  await executor
    .update(subscriptionTable)
    .set({
      status: 'canceled',
      canceledAt: now,
      endedAt: now,
      cancelAtPeriodEnd: false,
    })
    .where(inArray(subscriptionTable.id, starterIds))

  logger.info('Superseded Starter subscriptions after paid checkout', {
    referenceId,
    exceptSubscriptionId,
    canceledIds: starterIds,
  })

  return { canceledIds: starterIds }
}

/**
 * Whether other entitled rows are only Starter (so usage should reset like free→paid).
 */
export function onlyStarterEntitlementsRemain(
  otherSubscriptions: Array<{ plan: string | null }>
): boolean {
  if (!isArenaBilling()) return false
  if (otherSubscriptions.length === 0) return false
  return otherSubscriptions.every((row) => isStarterPlan(row.plan))
}
