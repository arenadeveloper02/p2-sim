import { organization, subscription as subscriptionTable } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { eq } from 'drizzle-orm'
import { STARTER_PLAN } from '@/lib/billing/arena/constants'
import {
  addStarterDurationMonths,
  buildStarterSubscriptionMetadata,
  getStarterUsageLimitDollars,
} from '@/lib/billing/arena/starter-plan'
import type { DbOrTx } from '@/lib/db/types'

const logger = createLogger('ArenaClientOrgBilling')

export interface ProvisionClientOrgStarterBillingParams {
  organizationId: string
  clientId: string
}

export interface ProvisionClientOrgStarterBillingResult {
  subscriptionId: string
  periodStart: Date
  periodEnd: Date
  orgUsageLimitDollars: number
}

/**
 * Provisions a one-month Starter entitlement for a newly created client organization.
 * Must run inside the same transaction as org creation.
 */
export async function provisionClientOrgStarterBilling(
  tx: DbOrTx,
  { organizationId, clientId }: ProvisionClientOrgStarterBillingParams
): Promise<ProvisionClientOrgStarterBillingResult> {
  const [existingSubscription] = await tx
    .select({ id: subscriptionTable.id })
    .from(subscriptionTable)
    .where(eq(subscriptionTable.referenceId, organizationId))
    .limit(1)

  if (existingSubscription) {
    throw new Error(
      `Organization ${organizationId} already has a subscription; refusing duplicate Starter provisioning`
    )
  }

  const now = new Date()
  const periodStart = now
  const periodEnd = addStarterDurationMonths(now)
  const orgUsageLimitDollars = getStarterUsageLimitDollars()
  const subscriptionId = generateId()

  await tx.insert(subscriptionTable).values({
    id: subscriptionId,
    plan: STARTER_PLAN,
    referenceId: organizationId,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    status: 'active',
    periodStart,
    periodEnd,
    cancelAtPeriodEnd: false,
    cancelAt: null,
    canceledAt: null,
    endedAt: null,
    seats: 1,
    trialStart: null,
    trialEnd: null,
    billingInterval: 'month',
    metadata: buildStarterSubscriptionMetadata(clientId),
  })

  await tx
    .update(organization)
    .set({
      orgUsageLimit: orgUsageLimitDollars.toFixed(2),
      updatedAt: now,
    })
    .where(eq(organization.id, organizationId))

  logger.info('Provisioned Starter billing for client organization', {
    organizationId,
    clientId,
    subscriptionId,
    periodEnd: periodEnd.toISOString(),
    orgUsageLimitDollars,
  })

  return {
    subscriptionId,
    periodStart,
    periodEnd,
    orgUsageLimitDollars,
  }
}
