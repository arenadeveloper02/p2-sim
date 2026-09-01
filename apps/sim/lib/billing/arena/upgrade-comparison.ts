import { STARTER_CREDITS } from '@/lib/billing/arena/constants'
import { ARENA_MAX_TIER } from '@/lib/billing/arena/tier-config'
import { DEFAULT_BILLING_CONCURRENCY_LIMITS } from '@/lib/billing/concurrency-defaults'
import type {
  ComparisonSection,
  PlanColumn,
} from '@/app/workspace/[workspaceId]/upgrade/components/comparison-table/comparison-data'

const formatCredits = (credits: number): string => credits.toLocaleString('en-US')

const SLACK = { icon: 'slack' as const }

/**
 * Arena comparison columns — Starter replaces Free; Pro is hidden from the upgrade UI.
 * Values are [Starter, Max, Enterprise]. Starter uses the Pro limit bucket.
 */
export const ARENA_PLAN_COLUMNS: PlanColumn[] = [
  { name: 'Starter', staticPrice: '$0' },
  { name: 'Max', staticPrice: null },
  { name: 'Enterprise', staticPrice: 'Custom' },
]

/** Full Arena comparison dataset (Starter / Max / Enterprise). */
export const ARENA_COMPARISON_SECTIONS: ComparisonSection[] = [
  {
    title: 'Credits & pricing',
    rows: [
      {
        label: 'Monthly credits',
        values: [formatCredits(STARTER_CREDITS), formatCredits(ARENA_MAX_TIER.credits), 'Custom'],
      },
      {
        label: 'Pricing',
        values: ['Included for 1 month', `$${ARENA_MAX_TIER.dollars}/org`, 'Custom'],
      },
    ],
  },
  {
    title: 'Workspaces & teams',
    rows: [
      {
        label: 'Workspaces',
        values: ['10', '10', 'Unlimited'],
      },
      {
        label: 'Invite teammates',
        values: [true, true, true],
      },
    ],
  },
  {
    title: 'Execution concurrency',
    rows: [
      {
        label: 'Concurrent executions',
        values: [
          DEFAULT_BILLING_CONCURRENCY_LIMITS.pro.toLocaleString('en-US'),
          DEFAULT_BILLING_CONCURRENCY_LIMITS.team.toLocaleString('en-US'),
          `${DEFAULT_BILLING_CONCURRENCY_LIMITS.enterprise.toLocaleString('en-US')} (customizable)`,
        ],
      },
    ],
  },
  {
    title: 'Rate limits (runs/min)',
    rows: [
      {
        label: 'Sync executions',
        values: ['150', '300', 'Custom'],
      },
      {
        label: 'Async executions',
        values: ['1,000', '2,500', 'Custom'],
      },
      {
        label: 'API endpoint',
        values: ['100', '200', 'Custom'],
      },
    ],
  },
  {
    title: 'Execution timeouts',
    rows: [
      {
        label: 'Sync timeout',
        values: ['120 min', '300 min', 'Custom'],
      },
      {
        label: 'Async timeout',
        values: ['300 min', '600 min', 'Custom'],
      },
    ],
  },
  {
    title: 'Storage & data',
    rows: [
      {
        label: 'File storage',
        values: ['50 GB', '500 GB', 'Custom'],
      },
      {
        label: 'Max tables',
        values: ['100', '1,000', 'Custom'],
      },
      {
        label: 'Max rows per table',
        values: ['100,000', '500,000', 'Custom'],
      },
      {
        label: 'Log retention',
        values: ['Unlimited', 'Unlimited', 'Unlimited'],
      },
    ],
  },
  {
    title: 'Features',
    rows: [
      {
        label: 'Sim Mailer (Inbox)',
        values: [true, true, true],
      },
      {
        label: 'KB Live Sync',
        values: [true, true, true],
      },
      {
        label: 'Slack Connect',
        values: [SLACK, SLACK, SLACK],
      },
      {
        label: 'Access Control',
        values: [false, false, true],
      },
      {
        label: 'SSO',
        values: [false, false, true],
      },
      {
        label: 'SOC2 Compliance',
        values: [false, false, true],
      },
      {
        label: 'Self Hosting',
        values: [false, false, true],
      },
      {
        label: 'Dedicated Support',
        values: [false, false, true],
      },
    ],
  },
]
