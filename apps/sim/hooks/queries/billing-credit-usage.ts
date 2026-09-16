import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  type CreditUsageSummary,
  getCreditUsageSummaryContract,
} from '@/lib/api/contracts/billing-credit-usage'

export const billingCreditUsageKeys = {
  all: ['billing-credit-usage'] as const,
  summaries: () => [...billingCreditUsageKeys.all, 'summary'] as const,
  workspace: (workspaceId?: string) =>
    [...billingCreditUsageKeys.summaries(), workspaceId ?? ''] as const,
  summary: (workspaceId?: string, personal = false) =>
    [...billingCreditUsageKeys.workspace(workspaceId), personal ? 'personal' : 'pooled'] as const,
}

async function fetchCreditUsageSummary(
  workspaceId: string,
  personal: boolean,
  signal?: AbortSignal
): Promise<CreditUsageSummary> {
  const response = await requestJson(getCreditUsageSummaryContract, {
    query: personal ? { workspaceId, personal: true } : { workspaceId },
    signal,
  })
  return response.data
}

/**
 * Credit usage for the billing page (Mothership + workflow runs). Org admins
 * receive organization totals and per-member rows unless `personal` is set,
 * which returns the caller's own usage plus the org pool.
 */
export function useBillingCreditUsage(workspaceId?: string, options?: { personal?: boolean }) {
  const personal = options?.personal === true
  return useQuery({
    queryKey: billingCreditUsageKeys.summary(workspaceId, personal),
    queryFn: ({ signal }) => fetchCreditUsageSummary(workspaceId as string, personal, signal),
    enabled: Boolean(workspaceId),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  })
}
