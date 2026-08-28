'use client'

import { useCallback } from 'react'
import { ArrowLeft, Chip, toast } from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import { useRouter } from 'next/navigation'
import { useQueryState } from 'nuqs'
import { ARENA_CONTACT_URL, ARENA_MAX_CREDIT_TIER } from '@/lib/billing/arena-max'
import {
  getArenaFreeUpgradeCardState,
  getArenaMaxUpgradeCardState,
} from '@/lib/billing/client/arena-max-upgrade-cta'
import { useSubscriptionUpgrade } from '@/lib/billing/client/upgrade'
import { DEFAULT_UPGRADE_HEADER, UPGRADE_REASON_COPY } from '@/lib/billing/upgrade-reasons'
import { useWorkspaceHostContext } from '@/app/workspace/[workspaceId]/providers/workspace-host-provider'
import { isBillingEnabled } from '@/app/workspace/[workspaceId]/settings/navigation'
import {
  ARENA_FREE_UPGRADE_FEATURES,
  ARENA_FREE_UPGRADE_PLAN_NAME,
  ARENA_FREE_UPGRADE_PRICE,
  ARENA_FREE_UPGRADE_SEGMENT_LABEL,
  ARENA_MAX_UPGRADE_CREDITS,
  ARENA_MAX_UPGRADE_FEATURES,
  ARENA_MAX_UPGRADE_PLAN_NAME,
  ARENA_MAX_UPGRADE_PRICE,
  ARENA_MAX_UPGRADE_PRICE_SUBTEXT,
  ARENA_MAX_UPGRADE_SEGMENT_LABEL,
} from '@/app/workspace/[workspaceId]/upgrade/arena-max-plan-configs'
import { UpgradePlanCard } from '@/app/workspace/[workspaceId]/upgrade/components'
import {
  upgradeReasonParam,
  upgradeUrlKeys,
} from '@/app/workspace/[workspaceId]/upgrade/search-params'
import { useFullscreenOriginStore } from '@/stores/fullscreen-origin'

export interface ArenaMaxUpgradeProps {
  workspaceId: string
  /** Free-tier credit allocation, computed on the server from `FREE_TIER_COST_LIMIT`. */
  freeCreditsLabel: string
}

/**
 * Arena upgrade page: Free + Team Max yearly ($1000/year via STRIPE_PRICE_TEAM_100_YR).
 * Checkout attaches the subscription to the workspace's organization.
 */
export function ArenaMaxUpgrade({ workspaceId, freeCreditsLabel }: ArenaMaxUpgradeProps) {
  const router = useRouter()
  const origin = useFullscreenOriginStore((s) => s.origin)
  const hostContext = useWorkspaceHostContext()
  const { handleUpgrade } = useSubscriptionUpgrade()
  const [reason] = useQueryState(upgradeReasonParam.key, {
    ...upgradeReasonParam.parser,
    ...upgradeUrlKeys,
  })

  const header = reason ? UPGRADE_REASON_COPY[reason].header : DEFAULT_UPGRADE_HEADER
  const plan = hostContext.ownerBilling.plan
  const maxCard = getArenaMaxUpgradeCardState(plan)
  const freeCard = getArenaFreeUpgradeCardState(plan)
  const organizationId = hostContext.hostOrganizationId

  const handleBack = useCallback(() => {
    router.replace(origin ?? `/workspace/${workspaceId}/home`)
  }, [origin, router, workspaceId])

  const handleGetStarted = useCallback(() => {
    if (maxCard.onPaidPlan) return
    if (!organizationId) {
      toast.error('This workspace is not attached to an organization yet.')
      return
    }

    void handleUpgrade('team', {
      creditTier: ARENA_MAX_CREDIT_TIER,
      annual: true,
      organizationId,
    }).catch((error) => {
      toast.error(getErrorMessage(error, 'Failed to upgrade'))
    })
  }, [maxCard.onPaidPlan, organizationId, handleUpgrade])

  if (!isBillingEnabled) return null

  return (
    <div className='flex h-full flex-col bg-[var(--bg)]'>
      <div className='flex flex-shrink-0 items-center bg-[var(--bg)] px-[16px] pt-[8.5px] pb-[8.5px]'>
        <Chip leftIcon={ArrowLeft} onClick={handleBack}>
          Back
        </Chip>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto px-6 [scrollbar-gutter:stable_both-edges]'>
        <div className='mx-auto flex w-full max-w-[960px] flex-col gap-7 pt-6 pb-3'>
          <div className='flex flex-col items-center gap-4'>
            <h1 className='text-balance text-center font-season text-[30px] text-[var(--text-primary)]'>
              {header}
            </h1>
          </div>

          <div className='mx-auto grid w-full max-w-[760px] grid-cols-1 gap-4 md:grid-cols-2'>
            <UpgradePlanCard
              name={ARENA_FREE_UPGRADE_PLAN_NAME}
              price={ARENA_FREE_UPGRADE_PRICE}
              segmentLabel={ARENA_FREE_UPGRADE_SEGMENT_LABEL}
              credits={freeCreditsLabel}
              features={ARENA_FREE_UPGRADE_FEATURES}
              buttonText={freeCard.buttonText}
              onButtonClick={() => undefined}
              buttonDisabled={freeCard.buttonDisabled}
              hideButton={freeCard.hideButton}
              highlighted={freeCard.highlighted}
              bannerText={freeCard.bannerText}
            />
            <UpgradePlanCard
              name={ARENA_MAX_UPGRADE_PLAN_NAME}
              price={ARENA_MAX_UPGRADE_PRICE}
              priceSubtext={ARENA_MAX_UPGRADE_PRICE_SUBTEXT}
              segmentLabel={ARENA_MAX_UPGRADE_SEGMENT_LABEL}
              credits={ARENA_MAX_UPGRADE_CREDITS.credits}
              refresh={ARENA_MAX_UPGRADE_CREDITS.refresh}
              features={ARENA_MAX_UPGRADE_FEATURES}
              buttonText={maxCard.buttonText}
              onButtonClick={handleGetStarted}
              buttonDisabled={maxCard.buttonDisabled}
              highlighted={maxCard.highlighted}
              bannerText={maxCard.bannerText}
            />
          </div>

          <p className='text-center text-[var(--text-muted)] text-sm'>
            Need custom limits?{' '}
            <a
              href={ARENA_CONTACT_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='text-[var(--text-primary)] underline-offset-2 hover:underline'
            >
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
