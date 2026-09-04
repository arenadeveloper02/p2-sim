import { useCallback } from 'react'
import { createLogger } from '@sim/logger'
import { isOrgAdminRole } from '@sim/platform-authz/predicates'
import { getErrorMessage } from '@sim/utils/errors'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { ApiClientError } from '@/lib/api/client/errors'
import { requestJson } from '@/lib/api/client/request'
import { listCreatorOrganizationsContract } from '@/lib/api/contracts/organizations'
import { subscriptionTransferContract } from '@/lib/api/contracts/user'
import { client, useSession, useSubscription } from '@/lib/auth/auth-client'
import {
  isBlockingOrgSubscription,
  isStripeUpgradeableSubscription,
} from '@/lib/billing/arena/checkout-policy'
import { buildPlanName, getDisplayPlanName, isPaid } from '@/lib/billing/plan-helpers'
import { hasPaidSubscriptionStatus } from '@/lib/billing/subscriptions/utils'
import { organizationKeys } from '@/hooks/queries/organization'
import { refreshSessionQuery } from '@/hooks/queries/session'

const logger = createLogger('SubscriptionUpgrade')

type TargetPlan = 'pro' | 'team'

const CONSTANTS = {
  INITIAL_TEAM_SEATS: 1,
  DEFAULT_CREDIT_TIER: 6000,
} as const

interface UpgradeOptions {
  creditTier?: number
  annual?: boolean
  organizationId?: string
}

/**
 * Better Auth returns `{ data, error }` for plugin calls; the Stripe upgrade
 * body itself also carries `url`. Accept either shape.
 */
function resolveCheckoutRedirectUrl(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const record = result as Record<string, unknown>
  if (typeof record.url === 'string' && record.url.length > 0) return record.url
  const data = record.data
  if (data && typeof data === 'object') {
    const url = (data as Record<string, unknown>).url
    if (typeof url === 'string' && url.length > 0) return url
  }
  return null
}

/**
 * Resolves the signed-in user for checkout. After Stripe cancel returns to the
 * app as a full page load, React Query session state can still be empty while
 * the first getSession is in flight — so a click must not trust a null hook
 * snapshot. Refresh from the server before failing closed.
 */
async function resolveCheckoutUserId(
  queryClient: QueryClient,
  sessionUserId: string | undefined
): Promise<string> {
  if (sessionUserId) return sessionUserId

  const fresh = await refreshSessionQuery(queryClient)
  const userId = fresh?.user?.id
  if (!userId) {
    throw new Error('User not authenticated')
  }
  return userId
}

export function useSubscriptionUpgrade() {
  const { data: session, isPending: isSessionPending } = useSession()
  const betterAuthSubscription = useSubscription()
  const queryClient = useQueryClient()

  const handleUpgrade = useCallback(
    async (targetPlan: TargetPlan, options?: UpgradeOptions) => {
      const creditTier = options?.creditTier ?? CONSTANTS.DEFAULT_CREDIT_TIER
      const annual = options?.annual ?? false
      const planName = buildPlanName(targetPlan, creditTier)
      const userId = await resolveCheckoutUserId(queryClient, session?.user?.id)

      let currentSubscriptionRowId: string | undefined
      let currentStripeSubscriptionId: string | undefined
      let allSubscriptions: any[] = []
      try {
        const listResult = await client.subscription.list()
        allSubscriptions = listResult.data || []
        const initialReferenceId =
          targetPlan === 'team' && options?.organizationId ? options.organizationId : userId
        const activeReferenceSub = allSubscriptions.find(
          (sub: any) =>
            hasPaidSubscriptionStatus(sub.status) &&
            sub.referenceId === initialReferenceId &&
            isStripeUpgradeableSubscription(sub)
        )
        currentSubscriptionRowId = activeReferenceSub?.id
        currentStripeSubscriptionId = activeReferenceSub?.stripeSubscriptionId
      } catch (_e) {
        currentSubscriptionRowId = undefined
        currentStripeSubscriptionId = undefined
      }

      if (currentSubscriptionRowId && !currentStripeSubscriptionId) {
        logger.error('Active paid subscription is missing its Stripe subscription ID', {
          userId,
          subscriptionRowId: currentSubscriptionRowId,
          targetPlan,
        })
        throw new Error(
          'We could not match your current plan with our payment provider. Please contact support before upgrading so you are not charged twice.'
        )
      }

      let referenceId = userId

      if (targetPlan === 'team') {
        try {
          let orgsData
          try {
            orgsData = await requestJson(listCreatorOrganizationsContract, {})
          } catch (err) {
            if (err instanceof ApiClientError) {
              throw new Error('Failed to check organization status')
            }
            throw err
          }
          const existingOrg = options?.organizationId
            ? orgsData.organizations?.find(
                (org) => org.id === options.organizationId && isOrgAdminRole(org.role)
              )
            : orgsData.organizations?.find((org) => isOrgAdminRole(org.role))

          if (options?.organizationId && !existingOrg) {
            throw new Error('Only organization administrators can upgrade this workspace plan.')
          }

          if (existingOrg) {
            const existingOrgSub = allSubscriptions.find(
              (sub: any) =>
                hasPaidSubscriptionStatus(sub.status) &&
                sub.referenceId === existingOrg.id &&
                isPaid(sub.plan) &&
                isBlockingOrgSubscription(sub)
            )

            if (existingOrgSub) {
              logger.warn('Organization already has an active subscription', {
                userId,
                organizationId: existingOrg.id,
                existingSubscriptionId: existingOrgSub.id,
                plan: existingOrgSub.plan,
              })
              const existingPlanName = getDisplayPlanName(existingOrgSub.plan)
              throw new Error(
                `This organization is already on the ${existingPlanName} plan. Manage it from the billing settings.`
              )
            }

            logger.info('Using existing organization for team plan upgrade', {
              userId,
              organizationId: existingOrg.id,
            })
            referenceId = existingOrg.id

            if (!options?.organizationId) {
              try {
                await client.organization.setActive({ organizationId: referenceId })
                logger.info('Set organization as active', { organizationId: referenceId })
              } catch (error) {
                logger.warn('Failed to set organization as active, proceeding with upgrade', {
                  organizationId: referenceId,
                  error: getErrorMessage(error, 'Unknown error'),
                })
              }
            }
          } else if (orgsData.isMemberOfAnyOrg) {
            throw new Error(
              'You are already a member of an organization. Please leave it or ask an admin to upgrade.'
            )
          } else {
            logger.info('Will create organization after payment succeeds', { userId })
          }
        } catch (error) {
          logger.error('Failed to prepare for team plan upgrade', error)
          throw error instanceof Error
            ? error
            : new Error('Failed to prepare team workspace. Please try again or contact support.')
        }
      }

      const currentUrl = `${window.location.origin}${window.location.pathname}`
      const successUrlObj = new URL(window.location.href)
      successUrlObj.searchParams.set('upgraded', 'true')
      const successUrl = successUrlObj.toString()

      try {
        const upgradeParams = {
          plan: planName,
          referenceId,
          successUrl,
          cancelUrl: currentUrl,
          // Own the navigation: Better Auth's redirect plugin would set
          // location.href as soon as the response lands, racing any UI pending
          // state and making duplicate checkout calls easy to miss.
          disableRedirect: true,
          ...(targetPlan === 'team' && { seats: CONSTANTS.INITIAL_TEAM_SEATS }),
          ...(annual && { annual: true }),
        } as const

        const finalParams = currentStripeSubscriptionId
          ? { ...upgradeParams, subscriptionId: currentStripeSubscriptionId }
          : upgradeParams

        logger.info(
          currentStripeSubscriptionId
            ? 'Upgrading existing subscription'
            : 'Creating new subscription',
          {
            targetPlan,
            planName,
            annual,
            currentStripeSubscriptionId,
            currentSubscriptionRowId,
            referenceId,
          }
        )

        const upgradeResult = await betterAuthSubscription.upgrade(finalParams)
        if (upgradeResult?.error) {
          throw new Error(
            upgradeResult.error.message || 'Checkout could not be started. Please try again.'
          )
        }

        if (targetPlan === 'team' && currentSubscriptionRowId && referenceId !== userId) {
          try {
            logger.info('Transferring subscription to organization after upgrade', {
              subscriptionId: currentSubscriptionRowId,
              organizationId: referenceId,
            })

            try {
              await requestJson(subscriptionTransferContract, {
                params: { id: currentSubscriptionRowId },
                body: { organizationId: referenceId },
              })
              logger.info('Successfully transferred subscription to organization', {
                subscriptionId: currentSubscriptionRowId,
                organizationId: referenceId,
              })
            } catch (transferError) {
              logger.error('Failed to transfer subscription to organization', {
                subscriptionId: currentSubscriptionRowId,
                organizationId: referenceId,
                error:
                  transferError instanceof ApiClientError
                    ? (transferError.rawBody ?? transferError.message)
                    : transferError instanceof Error
                      ? transferError.message
                      : 'Unknown error',
              })
            }
          } catch (error) {
            logger.error('Error transferring subscription after upgrade', error)
          }
        }

        if (targetPlan === 'team') {
          try {
            await queryClient.invalidateQueries({ queryKey: organizationKeys.lists() })
            logger.info('Refreshed organization data after team upgrade')
          } catch (error) {
            logger.warn('Failed to refresh organization data after upgrade', error)
          }
        }

        const checkoutUrl = resolveCheckoutRedirectUrl(upgradeResult)
        if (!checkoutUrl) {
          throw new Error('Checkout could not be started. Please try again.')
        }

        logger.info('Subscription upgrade completed successfully', { targetPlan, referenceId })
        window.location.assign(checkoutUrl)
      } catch (error) {
        logger.error('Failed to initiate subscription upgrade:', error)

        if (error instanceof Error) {
          logger.error('Detailed error:', {
            message: error.message,
            stack: error.stack,
            cause: error.cause,
          })
        }

        throw new Error(
          `Failed to upgrade subscription: ${getErrorMessage(error, 'Unknown error')}`
        )
      }
    },
    [session?.user?.id, betterAuthSubscription, queryClient]
  )

  return {
    handleUpgrade,
    /**
     * True while the session query has not settled. Upgrade CTAs should stay
     * disabled so a Stripe cancel reload cannot fire checkout against a null
     * session snapshot before {@link handleUpgrade}'s refresh runs.
     */
    isSessionPending,
    hasAuthenticatedUser: Boolean(session?.user?.id),
  }
}
