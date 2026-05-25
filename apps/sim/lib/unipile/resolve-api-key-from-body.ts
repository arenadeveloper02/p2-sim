import { resolveUnipileApiKey } from '@/lib/unipile/resolve-api-key'

/**
 * Reads optional `workspaceId` and `unipileApiKey` from an internal tool route JSON body.
 */
export function resolveUnipileApiKeyFromRequestBody(body: unknown): string {
  if (!body || typeof body !== 'object') {
    return resolveUnipileApiKey({})
  }

  const record = body as Record<string, unknown>
  return resolveUnipileApiKey({
    workspaceId: typeof record.workspaceId === 'string' ? record.workspaceId : undefined,
    unipileApiKey: typeof record.unipileApiKey === 'string' ? record.unipileApiKey : undefined,
  })
}
