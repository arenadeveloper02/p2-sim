import { resolveUnipileApiKey } from '@/lib/unipile/resolve-api-key'

/**
 * Reads optional `unipileApiKey`, `isClientUser`, and `userId` from URL search params (block editor pickers).
 */
export async function resolveUnipileApiKeyFromSearchParams(
  searchParams: URLSearchParams
): Promise<string> {
  const isClientUserRaw = searchParams.get('isClientUser')
  const isClientUser =
    isClientUserRaw === 'true' ? true : isClientUserRaw === 'false' ? false : undefined

  return resolveUnipileApiKey({
    unipileApiKey: searchParams.get('unipileApiKey') ?? undefined,
    isClientUser,
    userId: searchParams.get('userId') ?? undefined,
  })
}
