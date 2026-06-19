import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import { type HubSpotAccountOption, listHubSpotAccountsContract } from '@/lib/api/contracts/hubspot'
import { isAdminWorkspace } from '@/lib/workspaces/is-admin-workspace'

export const hubSpotAccountKeys = {
  all: ['hubspotAccounts'] as const,
  list: (workspaceId?: string) => [...hubSpotAccountKeys.all, 'list', workspaceId ?? ''] as const,
  label: (accountId?: string, workspaceId?: string) =>
    [...hubSpotAccountKeys.all, 'label', workspaceId ?? '', accountId ?? ''] as const,
}

async function fetchHubSpotAccountOptions(
  workspaceId: string,
  signal?: AbortSignal
): Promise<HubSpotAccountOption[]> {
  const data = await requestJson(listHubSpotAccountsContract, {
    query: { workspaceId },
    signal,
  })
  return data.items ?? []
}

export function useHubSpotAccountOptions(workspaceId?: string) {
  const enabled = Boolean(workspaceId) && isAdminWorkspace(workspaceId)

  return useQuery({
    queryKey: hubSpotAccountKeys.list(workspaceId),
    queryFn: ({ signal }) => fetchHubSpotAccountOptions(workspaceId as string, signal),
    enabled,
    staleTime: 60 * 1000,
  })
}

export function resolveHubSpotAccountLabel(
  accountId: string,
  options: HubSpotAccountOption[]
): string | null {
  const match = options.find(
    (option) =>
      option.id === accountId || option.alias === accountId || option.credentialId === accountId
  )
  return match?.label ?? null
}

/**
 * Resolves a HubSpot account picker value to its display label for canvas block rows.
 */
export function useHubSpotAccountDisplayName(
  accountId?: string,
  workspaceId?: string,
  enabled = true
) {
  const shouldFetch = enabled && Boolean(accountId) && Boolean(workspaceId)
  const { data: options = [] } = useHubSpotAccountOptions(shouldFetch ? workspaceId : undefined)

  const label = useMemo(() => {
    if (!accountId) return null
    return resolveHubSpotAccountLabel(accountId, options)
  }, [accountId, options])

  return { data: label }
}
