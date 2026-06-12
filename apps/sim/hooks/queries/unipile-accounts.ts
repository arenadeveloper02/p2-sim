import { useQuery } from '@tanstack/react-query'

export const unipileAccountLabelKeys = {
  all: ['unipileAccountLabel'] as const,
  detail: (accountId?: string) => [...unipileAccountLabelKeys.all, accountId ?? ''] as const,
}

async function fetchUnipileAccountLabel(
  accountId: string,
  signal?: AbortSignal
): Promise<string | null> {
  // boundary-raw-fetch: read-only label hydration for canvas rows; no contract yet
  const response = await fetch('/api/unipile/accounts', {
    credentials: 'include',
    signal,
  })
  if (!response.ok) return null

  const data = (await response.json()) as {
    success?: boolean
    items?: Array<{ id: string; label: string }>
  }
  if (!data?.success || !Array.isArray(data.items)) return null

  const match = data.items.find((item) => item.id === accountId)
  return match?.label ?? null
}

/**
 * Resolves a Unipile public account id (or matching picker value) to its display label
 * for canvas block rows and other read-only surfaces.
 */
export function useUnipileAccountDisplayName(accountId?: string, enabled = true) {
  return useQuery({
    queryKey: unipileAccountLabelKeys.detail(accountId),
    queryFn: ({ signal }) => fetchUnipileAccountLabel(accountId as string, signal),
    enabled: enabled && Boolean(accountId),
    staleTime: 60 * 1000,
  })
}
