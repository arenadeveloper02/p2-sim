import { useQuery } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  getWorkspaceUsageAnalyticsContract,
  type WorkspaceUsageAnalytics,
  type WorkspaceUsageAnalyticsQuery,
} from '@/lib/api/contracts/workspace-usage'

export const workspaceUsageKeys = {
  all: ['workspace-usage'] as const,
  analytics: () => [...workspaceUsageKeys.all, 'analytics'] as const,
  analytic: (workspaceId: string, query?: WorkspaceUsageAnalyticsQuery) =>
    [...workspaceUsageKeys.analytics(), workspaceId, query ?? {}] as const,
}

async function fetchWorkspaceUsageAnalytics(
  workspaceId: string,
  query: WorkspaceUsageAnalyticsQuery = {},
  signal?: AbortSignal
): Promise<WorkspaceUsageAnalytics> {
  return requestJson(getWorkspaceUsageAnalyticsContract, {
    params: { id: workspaceId },
    query,
    signal,
  })
}

/**
 * Usage analytics by tab/period/source. Intentionally omits `keepPreviousData` so
 * switching filters does not flash another query's totals while the next load runs.
 */
export function useWorkspaceUsageAnalytics(
  workspaceId: string | undefined,
  query: WorkspaceUsageAnalyticsQuery = {}
) {
  return useQuery({
    queryKey: workspaceUsageKeys.analytic(workspaceId ?? '', query),
    queryFn: ({ signal }) => fetchWorkspaceUsageAnalytics(workspaceId as string, query, signal),
    enabled: Boolean(workspaceId),
    staleTime: 60 * 1000,
  })
}
