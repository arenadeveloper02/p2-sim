import { useQuery } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  getWorkspaceUsageAnalyticsContract,
  type WorkspaceUsageAnalytics,
  type WorkspaceUsageAnalyticsQuery,
} from '@/lib/api/contracts/workspace-usage'
import {
  getWorkspaceCreditAvailabilityContract,
  getWorkspaceUsageGateContract,
  type WorkspaceCreditAvailability,
  type WorkspaceUsageGate,
} from '@/lib/api/contracts/workspaces'

export const workspaceUsageKeys = {
  all: ['workspace-usage'] as const,
  analytics: () => [...workspaceUsageKeys.all, 'analytics'] as const,
  analytic: (workspaceId: string, query?: WorkspaceUsageAnalyticsQuery) =>
    [...workspaceUsageKeys.analytics(), workspaceId, query ?? {}] as const,
  creditAvailabilities: () => [...workspaceUsageKeys.all, 'credit-availability'] as const,
  creditAvailability: (workspaceId: string) =>
    [...workspaceUsageKeys.creditAvailabilities(), workspaceId] as const,
  gates: () => [...workspaceUsageKeys.all, 'gate'] as const,
  gate: (workspaceId: string) => [...workspaceUsageKeys.gates(), workspaceId] as const,
}

export const WORKSPACE_USAGE_ANALYTICS_STALE_TIME = 60 * 1000
export const WORKSPACE_CREDIT_AVAILABILITY_STALE_TIME = 30 * 1000
export const WORKSPACE_USAGE_GATE_STALE_TIME = 30 * 1000

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

export function fetchWorkspaceCreditAvailability(
  workspaceId: string,
  signal?: AbortSignal
): Promise<WorkspaceCreditAvailability> {
  return requestJson(getWorkspaceCreditAvailabilityContract, {
    params: { id: workspaceId },
    signal,
  })
}

export function fetchWorkspaceUsageGate(
  workspaceId: string,
  signal?: AbortSignal
): Promise<WorkspaceUsageGate> {
  return requestJson(getWorkspaceUsageGateContract, {
    params: { id: workspaceId },
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
    staleTime: WORKSPACE_USAGE_ANALYTICS_STALE_TIME,
  })
}

export function useWorkspaceCreditAvailability(workspaceId?: string) {
  return useQuery({
    queryKey: workspaceUsageKeys.creditAvailability(workspaceId ?? ''),
    queryFn: ({ signal }) => fetchWorkspaceCreditAvailability(workspaceId as string, signal),
    enabled: Boolean(workspaceId),
    staleTime: WORKSPACE_CREDIT_AVAILABILITY_STALE_TIME,
  })
}

export function useWorkspaceUsageGate(workspaceId?: string) {
  return useQuery({
    queryKey: workspaceUsageKeys.gate(workspaceId ?? ''),
    queryFn: ({ signal }) => fetchWorkspaceUsageGate(workspaceId as string, signal),
    enabled: Boolean(workspaceId),
    staleTime: WORKSPACE_USAGE_GATE_STALE_TIME,
  })
}
