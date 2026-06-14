import { useMemo } from 'react'
import type { UnipileAccountOption } from '@/lib/api/contracts/unipile'
import { useUnipileAccountOptions } from '@/hooks/queries/unipile'

/**
 * Resolves a stored credential id or Unipile external account id to a picker label.
 */
export function resolveUnipileAccountLabel(
  accountId: string,
  options: UnipileAccountOption[]
): string | null {
  const match = options.find(
    (option) =>
      option.id === accountId ||
      option.externalAccountId === accountId ||
      option.credentialId === accountId
  )
  return match?.label ?? null
}

/**
 * Resolves a Unipile account picker value to its display label for canvas block rows.
 */
export function useUnipileAccountDisplayName(
  accountId?: string,
  workspaceId?: string,
  enabled = true
) {
  const shouldFetch = enabled && Boolean(accountId) && Boolean(workspaceId)
  const { data: options = [] } = useUnipileAccountOptions(shouldFetch ? workspaceId : undefined)

  const label = useMemo(() => {
    if (!accountId) return null
    return resolveUnipileAccountLabel(accountId, options)
  }, [accountId, options])

  return { data: label }
}
