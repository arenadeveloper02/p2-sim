import { parseAsBoolean, parseAsString, parseAsStringLiteral } from 'nuqs/server'

/** Usage dashboard surface tabs. */
export const USAGE_TABS = ['all', 'workflow', 'mothership'] as const

export type UsageTab = (typeof USAGE_TABS)[number]

/** User / workspace / organization analytics scope. */
export const USAGE_SCOPES = ['user', 'workspace', 'organization'] as const

export type UsageScope = (typeof USAGE_SCOPES)[number]

/** Preset lookback windows supported by the usage analytics API. */
export const USAGE_PERIODS = ['1d', '7d', '30d', '90d'] as const

export type UsagePeriod = (typeof USAGE_PERIODS)[number]

/**
 * Sentinel for `userWorkspaceId`: view analytics across all membership workspaces.
 * Absence / `null` means the current route workspace.
 */
export const USER_WORKSPACE_FILTER_ALL = 'all' as const

/**
 * Co-located URL query-param definitions for the usage dashboard.
 *
 * - `scope` selects user / workspace / organization analytics (admin-gated in the UI).
 * - `tab` selects the primary surface (all sources, workflow-only, mothership-only).
 * - `period` is the preset lookback when `allTime` is false and no custom range is set.
 * - `allTime` disables the period window and queries the full retained history.
 * - `startTime` / `endTime` are the applied custom range bounds (Calendar `YYYY-MM-DD` or
 *   `YYYY-MM-DDTHH:mm`). Meaningful when both are set and `allTime` is false; they map
 *   directly to the analytics API query fields.
 * - `rootExecutionId` drills into an execution lineage tree (single-workspace scopes only).
 * - `orgWorkspaceId` optionally subsets organization analytics to one workspace.
 * - `userWorkspaceId` subsets user analytics: `null` = current route workspace, `all` = all
 *   memberships, otherwise a specific membership workspace id.
 */
export const usageParsers = {
  scope: parseAsStringLiteral(USAGE_SCOPES).withDefault('user'),
  tab: parseAsStringLiteral(USAGE_TABS).withDefault('all'),
  period: parseAsStringLiteral(USAGE_PERIODS).withDefault('30d'),
  allTime: parseAsBoolean.withDefault(false),
  startTime: parseAsString,
  endTime: parseAsString,
  rootExecutionId: parseAsString,
  orgWorkspaceId: parseAsString,
  userWorkspaceId: parseAsString,
} as const

/** Tab/period view-state: clean URLs, no back-stack churn. */
export const usageUrlKeys = {
  history: 'replace',
  clearOnDefault: true,
} as const
