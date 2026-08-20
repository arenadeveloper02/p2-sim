import { ARENA_MAX_PRICE_USD_PER_YEAR } from '@/lib/billing/arena-max'

export const ARENA_MAX_UPGRADE_PLAN_NAME = 'Enterprise' as const

export const ARENA_MAX_UPGRADE_PRICE = `$${ARENA_MAX_PRICE_USD_PER_YEAR}`

export const ARENA_MAX_UPGRADE_PRICE_SUBTEXT = 'per year' as const

export const ARENA_MAX_UPGRADE_SEGMENT_LABEL = 'For scaling businesses' as const

export const ARENA_MAX_UPGRADE_CREDITS = {
  credits: 'Unlimited',
} as const

export const ARENA_MAX_UPGRADE_FEATURES: readonly string[] = [
  '1000 concurrent executions',
  '300 sync executions',
  'Invite teammates',
  'KB Live Sync',
  'Highest rate limits',
  'Expanded storage & tables',
  'Dedicated support',
]

export const ARENA_FREE_UPGRADE_PLAN_NAME = 'Free Plan' as const

export const ARENA_FREE_UPGRADE_PRICE = '$0' as const

export const ARENA_FREE_UPGRADE_SEGMENT_LABEL = 'For getting started' as const

export const ARENA_FREE_UPGRADE_FEATURES: readonly string[] = [
  '100 concurrent executions',
  '50 sync executions',
  '5 minute execution timeout',
  '90 minute async execution timeout',
  '5GM file storage',
  '5 max tables',
  '50000 max rows per table',
]
