import { parseAsBoolean, parseAsString, parseAsStringLiteral } from 'nuqs/server'

/** Usage dashboard surface tabs. */
export const USAGE_TABS = ['all', 'workflow', 'mothership'] as const

export type UsageTab = (typeof USAGE_TABS)[number]

/** Preset lookback windows supported by the usage analytics API. */
export const USAGE_PERIODS = ['1d', '7d', '30d', '90d'] as const

export type UsagePeriod = (typeof USAGE_PERIODS)[number]

/**
 * Co-located URL query-param definitions for the workspace usage dashboard.
 *
 * - `tab` selects the primary surface (all sources, workflow-only, mothership-only).
 * - `period` is the preset lookback when `allTime` is false.
 * - `allTime` disables the period window and queries the full retained history.
 * - `rootExecutionId` drills into an execution lineage tree (workflow tab).
 */
export const usageParsers = {
  tab: parseAsStringLiteral(USAGE_TABS).withDefault('all'),
  period: parseAsStringLiteral(USAGE_PERIODS).withDefault('30d'),
  allTime: parseAsBoolean.withDefault(false),
  rootExecutionId: parseAsString,
} as const

/** Tab/period view-state: clean URLs, no back-stack churn. */
export const usageUrlKeys = {
  history: 'replace',
  clearOnDefault: true,
} as const
