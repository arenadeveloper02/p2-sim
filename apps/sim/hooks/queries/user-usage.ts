import { useQuery } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  getUserUsageAnalyticsContract,
  type UserUsageAnalytics,
  type UserUsageAnalyticsQuery,
} from '@/lib/api/contracts/user-usage'

export const USER_USAGE_ANALYTICS_STALE_TIME = 60 * 1000

export const userUsageKeys = {
  all: ['user-usage'] as const,
  analytics: () => [...userUsageKeys.all, 'analytics'] as const,
  analytic: (query?: UserUsageAnalyticsQuery) =>
    [...userUsageKeys.analytics(), query ?? {}] as const,
}

async function fetchUserUsageAnalytics(
  query: UserUsageAnalyticsQuery = {},
  signal?: AbortSignal
): Promise<UserUsageAnalytics> {
  return requestJson(getUserUsageAnalyticsContract, {
    query,
    signal,
  })
}

/**
 * Self-scoped usage analytics by tab/period/source/workspace filter.
 * Intentionally omits `keepPreviousData` so switching filters does not flash
 * another query's totals.
 */
export function useUserUsageAnalytics(query: UserUsageAnalyticsQuery = {}, enabled = true) {
  return useQuery({
    queryKey: userUsageKeys.analytic(query),
    queryFn: ({ signal }) => fetchUserUsageAnalytics(query, signal),
    enabled,
    staleTime: USER_USAGE_ANALYTICS_STALE_TIME,
  })
}
