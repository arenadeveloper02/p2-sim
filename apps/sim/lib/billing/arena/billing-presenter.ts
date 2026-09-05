import { isStarterPlan } from '@/lib/billing/arena/starter-plan'
import { isPaid } from '@/lib/billing/plan-helpers'

type EntitledSubscription = {
  plan: string
  status: string | null
} | null

type LatestSubscription = EntitledSubscription

export type OrganizationSubscriptionPresentationState =
  | 'active'
  | 'free'
  | 'lapsed'
  | 'starter_expired'

export interface OrganizationSubscriptionPresentation {
  subscriptionState: OrganizationSubscriptionPresentationState
  displayedSubscription: EntitledSubscription | LatestSubscription
  activeStarter: boolean
}

/**
 * Classifies organization subscription for the billing API and settings UI.
 */
export function presentOrganizationSubscription(params: {
  entitledSubscription: EntitledSubscription
  latestSubscription: LatestSubscription
}): OrganizationSubscriptionPresentation {
  const { entitledSubscription, latestSubscription } = params

  const entitledStarter =
    entitledSubscription && isStarterPlan(entitledSubscription.plan) ? entitledSubscription : null
  const activePaid =
    entitledSubscription && isPaid(entitledSubscription.plan) ? entitledSubscription : null
  const activeStarter = entitledStarter
  const freeNonStarter =
    entitledSubscription && !isPaid(entitledSubscription.plan) && !entitledStarter
      ? entitledSubscription
      : null

  const lapsedPaid =
    !entitledSubscription && latestSubscription && isPaid(latestSubscription.plan)
      ? latestSubscription
      : null

  const lapsedStarter =
    !entitledSubscription &&
    latestSubscription &&
    isStarterPlan(latestSubscription.plan) &&
    !lapsedPaid
      ? latestSubscription
      : null

  const displayedSubscription =
    activePaid ?? activeStarter ?? freeNonStarter ?? lapsedPaid ?? lapsedStarter ?? null

  let subscriptionState: OrganizationSubscriptionPresentationState = 'free'
  if (activePaid || activeStarter) {
    subscriptionState = 'active'
  } else if (lapsedPaid) {
    subscriptionState = 'lapsed'
  } else if (lapsedStarter) {
    subscriptionState = 'starter_expired'
  }

  return {
    subscriptionState,
    displayedSubscription,
    activeStarter: Boolean(activeStarter),
  }
}
