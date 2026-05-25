import { env } from '@/lib/core/config/env'
import { isAdminWorkspace } from '@/lib/workspaces/is-admin-workspace'

export interface ResolveUnipileApiKeyOptions {
  workspaceId?: string | null
  unipileApiKey?: string | null
}

/**
 * Resolves the Unipile API key: block-level key first, then `UNIPILE_API_KEY` from env.
 * Admin workspaces may supply a block key for BYOK; server flows (hosted auth, disconnect) use env when no block key is present.
 */
export function resolveUnipileApiKey(options: ResolveUnipileApiKeyOptions): string {
  const blockKey = options.unipileApiKey?.trim()
  if (blockKey) {
    return blockKey
  }

  const envKey = env.UNIPILE_API_KEY?.trim()
  if (envKey) {
    return envKey
  }

  if (isAdminWorkspace(options.workspaceId)) {
    throw new Error(
      'Unipile API key is missing. Provide the Unipile API Key in the LinkedIn (Unipile) block or configure UNIPILE_API_KEY.'
    )
  }

  throw new Error('UNIPILE_API_KEY is not configured')
}
