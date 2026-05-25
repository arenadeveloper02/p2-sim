import { resolveUnipileApiKey } from '@/lib/unipile/resolve-api-key'

/**
 * Reads optional `workspaceId` and `unipileApiKey` from URL search params (block editor pickers).
 */
export function resolveUnipileApiKeyFromSearchParams(searchParams: URLSearchParams): string {
  return resolveUnipileApiKey({
    workspaceId: searchParams.get('workspaceId') ?? undefined,
    unipileApiKey: searchParams.get('unipileApiKey') ?? undefined,
  })
}
