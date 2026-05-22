import { env } from '@/lib/core/config/env'
import { isAdminWorkspace } from '@/lib/workspaces/is-admin-workspace'

export interface ResolveUnipileApiKeyOptions {
  workspaceId?: string | null
  unipileApiKey?: string | null
}

/**
 * Admin workspaces use the block-provided key; all other workspaces use `UNIPILE_API_KEY` from env.
 */
export function resolveUnipileApiKey(options: ResolveUnipileApiKeyOptions): string {
  const isAdmin = isAdminWorkspace(options.workspaceId)

  if (isAdmin) {
    const key = options.unipileApiKey?.trim()
    if (!key) {
      throw new Error(
        'Unipile API key is missing. Provide the Unipile API Key in the LinkedIn (Unipile) block.'
      )
    }
    return key
  }

  const key = env.UNIPILE_API_KEY?.trim()
  if (!key) {
    throw new Error('UNIPILE_API_KEY is not configured')
  }
  return key
}
