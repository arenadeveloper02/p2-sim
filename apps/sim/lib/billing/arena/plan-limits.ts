import { isArenaBilling } from '@/lib/billing/arena/env'
import { isStarterPlan } from '@/lib/billing/arena/starter-plan'
import { isArenaMaxPlan, isArenaProPlan } from '@/lib/billing/arena/tier-config'
import type { PlanCategory } from '@/lib/billing/plan-helpers'

/**
 * Maps Arena plans onto upstream limit buckets.
 * Starter and Max → `team` (Max limits); Pro → `pro`.
 * Returns null when upstream plan-helpers should decide.
 */
export function getArenaPlanTypeForLimits(plan: string | null | undefined): PlanCategory | null {
  if (!isArenaBilling() || !plan) return null
  if (isStarterPlan(plan) || isArenaMaxPlan(plan)) return 'team'
  if (isArenaProPlan(plan)) return 'pro'
  return null
}
