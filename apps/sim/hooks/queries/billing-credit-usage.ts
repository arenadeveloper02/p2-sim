import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import {
  type CreditUsageSummary,
  getCreditUsageSummaryContract,
} from '@/lib/api/contracts/billing-credit-usage'

/** Default cache window for billing credit-usage summaries. */
export const BILLING_CREDIT_USAGE_STALE_TIME = 15 * 1000

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
    query: {
      workspaceId,
      ...(personal ? { personal: true } : {}),
    },
    signal,
  })
  return response.data
}

interface UseBillingCreditUsageOptions {
  /**
   * When true, org admins/owners receive their own usage + org pool (User tab)
   * instead of org-wide pooled totals (Organization tab).
   */
  personal?: boolean
  /** Override default stale time (ms). */
  staleTime?: number
  /** Refetch while the Usage page stays open so remaining credits stay near real-time. */
  refetchInterval?: number | false
  refetchOnMount?: boolean | 'always'
}

/**
 * Credit usage for the billing page (Mothership + workflow runs). Org admins
 * receive organization totals and per-member rows unless `personal` is set;
 * standard users see personal usage only.
 */
export function useBillingCreditUsage(
  workspaceId?: string,
  options?: UseBillingCreditUsageOptions
) {
  const personal = options?.personal === true

  return useQuery({
    queryKey: billingCreditUsageKeys.summary(workspaceId, personal),
    queryFn: ({ signal }) => fetchCreditUsageSummary(workspaceId as string, personal, signal),
    enabled: Boolean(workspaceId),
    staleTime: options?.staleTime ?? BILLING_CREDIT_USAGE_STALE_TIME,
    refetchInterval: options?.refetchInterval,
    refetchOnMount: options?.refetchOnMount,
    placeholderData: keepPreviousData,
  })
}
