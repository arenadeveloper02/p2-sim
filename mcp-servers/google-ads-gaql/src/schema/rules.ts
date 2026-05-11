/**
 * GAQL Quality Gates and Validation Rules
 */

export interface GaqlRule {
  id: string
  severity: 'error' | 'warning' | 'info'
  description: string
  example?: string
}

export const GAQL_RULES: GaqlRule[] = [
  {
    id: 'mandatory-date-filter',
    severity: 'error',
    description: 'Every query MUST include date filtering using segments.date BETWEEN \'YYYY-MM-DD\' AND \'YYYY-MM-DD\'. Exception: snapshot resources (asset, campaign_asset, asset_group_asset, change_event, campaign_criterion).',
    example: 'WHERE segments.date BETWEEN \'2026-04-08\' AND \'2026-05-07\'',
  },
  {
    id: 'no-during-clause',
    severity: 'error',
    description: 'NEVER use DURING clauses (e.g., DURING LAST_7_DAYS). Always calculate explicit dates and use BETWEEN.',
  },
  {
    id: 'no-comparison-on-segments-date',
    severity: 'error',
    description: 'NEVER use comparison operators (>, <, >=, <=) on segments.date. Use BETWEEN only.',
  },
  {
    id: 'last-n-days-excludes-today',
    severity: 'error',
    description: '"last N days" excludes today. End date must be YESTERDAY (CURRENT_DATE - 1 day), not today.',
  },
  {
    id: 'campaign-status-enabled',
    severity: 'warning',
    description: 'Add campaign.status = \'ENABLED\' to filter only active campaigns (unless user explicitly asks for all statuses).',
  },
  {
    id: 'cost-in-micros',
    severity: 'info',
    description: 'cost_micros is in micros. 1 unit of currency = 1,000,000 micros. Convert dollar amounts: $100 -> 100000000.',
  },
  {
    id: 'limit-only-when-asked',
    severity: 'info',
    description: 'Only add LIMIT clause when user explicitly requests a count (e.g., "top 10"). Otherwise omit.',
  },
  {
    id: 'change-event-special',
    severity: 'error',
    description: 'change_event resource: Use change_event.change_date_time for date filtering, NOT segments.date. MUST include LIMIT (recommended 500).',
  },
  {
    id: 'asset-snapshot',
    severity: 'error',
    description: 'asset, campaign_asset, asset_group_asset, campaign_criterion resources are SNAPSHOT-only. They do NOT support segments.date.',
  },
  {
    id: 'always-include-conversions-value',
    severity: 'warning',
    description: 'For campaign-level queries, always include metrics.conversions_value and metrics.average_cpc so ROAS and CPC can be calculated.',
  },
  {
    id: 'search-term-required',
    severity: 'error',
    description: 'For campaign_search_term_view, always include campaign_search_term_view.search_term to see actual search queries.',
  },
  {
    id: 'segments-date-only-when-daily',
    severity: 'info',
    description: 'Only include segments.date in SELECT clause if user asks for "daily breakdown" or "by day". Otherwise it causes per-day rows.',
  },
]

export const SNAPSHOT_RESOURCES = new Set([
  'asset',
  'campaign_asset',
  'asset_group_asset',
  'campaign_criterion',
  'change_event',
  'change_status',
  'audience',
  'conversion_action',
  'label',
  'recommendation',
  'campaign_budget',
])

export function isSnapshotResource(resourceName: string): boolean {
  return SNAPSHOT_RESOURCES.has(resourceName)
}
