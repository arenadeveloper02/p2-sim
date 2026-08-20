import { useQuery } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import { getUserAccessContract, type UserAccessCapability } from '@/lib/api/contracts/user'
import { BILLING_NAV_CAPABILITY } from '@/lib/user-access/capabilities'

export const USER_ACCESS_STALE_TIME = 60 * 1000

export const userAccessKeys = {
  all: ['user-access'] as const,
  lists: () => [...userAccessKeys.all, 'list'] as const,
  list: () => [...userAccessKeys.lists()] as const,
}

async function fetchUserAccess(signal?: AbortSignal): Promise<UserAccessCapability[]> {
  const data = await requestJson(getUserAccessContract, { signal })
  return data.capabilities
}

export function useUserAccess() {
  return useQuery({
    queryKey: userAccessKeys.list(),
    queryFn: ({ signal }) => fetchUserAccess(signal),
    staleTime: USER_ACCESS_STALE_TIME,
  })
}

export function useHasBillingNavAccess() {
  const query = useUserAccess()
  return {
    ...query,
    hasBillingNavAccess: query.data?.includes(BILLING_NAV_CAPABILITY) ?? false,
  }
}
