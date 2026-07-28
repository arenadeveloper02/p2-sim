import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  type CreditUsageSummary,
  getCreditUsageSummaryContract,
} from '@/lib/api/contracts/billing-credit-usage'

export const billingCreditUsageKeys = {
  all: ['billing-credit-usage'] as const,
  summary: (workspaceId?: string) =>
    [...billingCreditUsageKeys.all, 'summary', workspaceId ?? ''] as const,
}

async function fetchCreditUsageSummary(
  workspaceId: string,
  signal?: AbortSignal
): Promise<CreditUsageSummary> {
  const response = await requestJson(getCreditUsageSummaryContract, {
    query: { workspaceId },
    signal,
  })
  return response.data
}

/**
 * Credit usage for the billing page (Mothership + workflow runs). Org admins
 * receive organization totals and per-member rows; standard users see personal
 * usage only.
 */
export function useBillingCreditUsage(workspaceId?: string) {
  return useQuery({
    queryKey: billingCreditUsageKeys.summary(workspaceId),
    queryFn: ({ signal }) => fetchCreditUsageSummary(workspaceId as string, signal),
    enabled: Boolean(workspaceId),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  })
}
