import { ARENA_CREDIT_TIERS } from '@/lib/billing/arena/tier-config'
import { getFreeTierLimit } from '@/lib/billing/subscriptions/utils'
import { env } from '@/lib/core/config/env'

export interface ArenaBillingPlan {
  name: string
  priceId: string
  annualDiscountPriceId?: string
  limits: {
    cost: number
  }
}

/**
 * Arena Better Auth / Stripe plan catalog.
 *
 * Org-only paid plans at flat org pricing:
 *   - team_1950  (Pro, $30/mo)
 *   - team_6500  (Max, $100/mo)
 *
 * Personal `pro_*` tiers are omitted — Arena users join via client organizations.
 */
export function getArenaPlans(): ArenaBillingPlan[] {
  const plans: ArenaBillingPlan[] = [
    {
      name: 'free',
      priceId: env.STRIPE_FREE_PRICE_ID || '',
      limits: { cost: getFreeTierLimit() },
    },
  ]

  const teamPriceMap: Record<number, { monthly: string; annual: string }> = {
    30: {
      monthly: env.STRIPE_PRICE_TEAM_30_MO || '',
      annual: env.STRIPE_PRICE_TEAM_30_YR || '',
    },
    100: {
      monthly: env.STRIPE_PRICE_TEAM_100_MO || '',
      annual: env.STRIPE_PRICE_TEAM_100_YR || '',
    },
  }

  for (const tier of ARENA_CREDIT_TIERS) {
    const prices = teamPriceMap[tier.dollars]
    if (!prices?.monthly) continue

    plans.push({
      name: `team_${tier.credits}`,
      priceId: prices.monthly,
      annualDiscountPriceId: prices.annual || undefined,
      limits: { cost: tier.dollars },
    })
  }

  plans.push({
    name: 'enterprise',
    priceId: 'price_dynamic',
    limits: { cost: 200 },
  })

  return plans
}
