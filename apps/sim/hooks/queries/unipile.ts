import { useQuery } from '@tanstack/react-query'
import { requestJson } from '@/lib/api/client/request'
import { listUnipileAccountsContract, type UnipileAccountOption } from '@/lib/api/contracts/unipile'
import { isAdminWorkspace } from '@/lib/workspaces/is-admin-workspace'

export const unipileAccountKeys = {
  all: ['unipileAccounts'] as const,
  list: (workspaceId?: string) => [...unipileAccountKeys.all, 'list', workspaceId ?? ''] as const,
}

async function fetchUnipileAccountOptions(
  workspaceId: string,
  signal?: AbortSignal
): Promise<UnipileAccountOption[]> {
  const data = await requestJson(listUnipileAccountsContract, {
    query: { workspaceId },
    signal,
  })
  return data.items ?? []
}

export function useUnipileAccountOptions(workspaceId?: string) {
  const enabled = Boolean(workspaceId) && isAdminWorkspace(workspaceId)

  return useQuery({
    queryKey: unipileAccountKeys.list(workspaceId),
    queryFn: ({ signal }) => fetchUnipileAccountOptions(workspaceId as string, signal),
    enabled,
    staleTime: 60 * 1000,
  })
}
