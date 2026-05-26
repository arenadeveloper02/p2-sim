import { resolveUnipileApiKey, resolveUnipileApiKeySync } from '@/lib/unipile/resolve-api-key'

/**
 * Reads optional `unipileApiKey`, `isClientUser`, and `userId` from an internal tool route JSON body.
 */
export async function resolveUnipileApiKeyFromRequestBody(body: unknown): Promise<string> {
  if (!body || typeof body !== 'object') {
    return resolveUnipileApiKey({})
  }

  const record = body as Record<string, unknown>
  const isClientUser = typeof record.isClientUser === 'boolean' ? record.isClientUser : undefined

  if (typeof isClientUser === 'boolean') {
    return resolveUnipileApiKeySync({
      isClientUser,
      unipileApiKey: typeof record.unipileApiKey === 'string' ? record.unipileApiKey : undefined,
    })
  }

  return resolveUnipileApiKey({
    unipileApiKey: typeof record.unipileApiKey === 'string' ? record.unipileApiKey : undefined,
    userId: typeof record.userId === 'string' ? record.userId : undefined,
  })
}
