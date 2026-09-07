import { organization, subscription as subscriptionTable } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { isArenaBilling } from '@/lib/billing/arena/env'
import {
  getStarterUsageLimitDollars,
  isStarterActive,
  isStarterPlan,
} from '@/lib/billing/arena/starter-plan'
import type { OrgUsageLimitResult } from '@/lib/billing/core/usage'
import { toDecimal, toNumber } from '@/lib/billing/utils/decimal'
import type { DbClient } from '@/lib/db/types'

/**
 * Resolves org usage limit for the Starter plan. Expired or missing Starter yields zero.
 */
export async function resolveArenaStarterOrgUsageLimit(
  organizationId: string,
  plan: string,
  configuredLimit: number | null,
  executor: DbClient
): Promise<OrgUsageLimitResult | null> {
  if (!isArenaBilling() || !isStarterPlan(plan)) return null

  const [subRow] = await executor
    .select({
      plan: subscriptionTable.plan,
      status: subscriptionTable.status,
      periodEnd: subscriptionTable.periodEnd,
    })
    .from(subscriptionTable)
    .where(eq(subscriptionTable.referenceId, organizationId))
    .limit(1)

  if (!subRow || !isStarterActive(subRow)) {
    return { limit: 0, minimum: 0 }
  }

  const [orgRow] = await executor
    .select({ orgUsageLimit: organization.orgUsageLimit })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)

  const configured =
    orgRow?.orgUsageLimit != null
      ? toNumber(toDecimal(orgRow.orgUsageLimit))
      : (configuredLimit ?? getStarterUsageLimitDollars())

  const limit = configured > 0 ? configured : getStarterUsageLimitDollars()
  return { limit, minimum: limit }
}
