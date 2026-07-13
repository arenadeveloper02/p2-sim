import { useQuery } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  getOrganizationUsageAnalyticsContract,
  type OrganizationUsageAnalytics,
  type OrganizationUsageAnalyticsQuery,
} from '@/lib/api/contracts/organization-usage'

export const organizationUsageKeys = {
  all: ['organization-usage'] as const,
  analytics: () => [...organizationUsageKeys.all, 'analytics'] as const,
  analytic: (organizationId: string, query?: OrganizationUsageAnalyticsQuery) =>
    [...organizationUsageKeys.analytics(), organizationId, query ?? {}] as const,
}

async function fetchOrganizationUsageAnalytics(
  organizationId: string,
  query: OrganizationUsageAnalyticsQuery = {},
  signal?: AbortSignal
): Promise<OrganizationUsageAnalytics> {
  return requestJson(getOrganizationUsageAnalyticsContract, {
    params: { id: organizationId },
    query,
    signal,
  })
}

/**
 * Organization-wide usage analytics by tab/period/source/workspace filter.
 * Intentionally omits `keepPreviousData` so switching filters does not flash
 * another query's totals.
 */
export function useOrganizationUsageAnalytics(
  organizationId: string | undefined,
  query: OrganizationUsageAnalyticsQuery = {},
  enabled = true
) {
  return useQuery({
    queryKey: organizationUsageKeys.analytic(organizationId ?? '', query),
    queryFn: ({ signal }) =>
      fetchOrganizationUsageAnalytics(organizationId as string, query, signal),
    enabled: Boolean(organizationId) && enabled,
    staleTime: 60 * 1000,
  })
}
