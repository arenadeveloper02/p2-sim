import { env } from '@/lib/core/config/env'
import { lookupIsClientUserForUserId } from '@/lib/users/lookup-client-user'

export interface ResolveUnipileApiKeyOptions {
  workspaceId?: string | null
  unipileApiKey?: string | null
  /** When set, takes precedence over `userId` lookup. */
  isClientUser?: boolean | null
  userId?: string | null
}

async function resolveIsClientUserFlag(options: ResolveUnipileApiKeyOptions): Promise<boolean> {
  if (options.isClientUser === true) return true
  if (options.isClientUser === false) return false
  if (options.userId) {
    return lookupIsClientUserForUserId(options.userId)
  }
  return false
}

/**
 * Internal users use `UNIPILE_API_KEY` from the deployment environment.
 * Client users must supply the Unipile API key on the LinkedIn (Unipile) block.
 */
export async function resolveUnipileApiKey(options: ResolveUnipileApiKeyOptions): Promise<string> {
  const isClient = await resolveIsClientUserFlag(options)

  if (!isClient) {
    const key = env.UNIPILE_API_KEY?.trim()
    if (!key) {
      throw new Error('UNIPILE_API_KEY is not configured')
    }
    return key
  }

  const key = options.unipileApiKey?.trim()
  if (!key) {
    throw new Error(
      'Unipile API key is missing. Provide the Unipile API Key in the LinkedIn (Unipile) block.'
    )
  }
  return key
}

/**
 * Synchronous resolver when `isClientUser` is already known (e.g. request body from executor).
 */
export function resolveUnipileApiKeySync(
  options: ResolveUnipileApiKeyOptions & { isClientUser: boolean }
): string {
  if (!options.isClientUser) {
    const key = env.UNIPILE_API_KEY?.trim()
    if (!key) {
      throw new Error('UNIPILE_API_KEY is not configured')
    }
    return key
  }

  const key = options.unipileApiKey?.trim()
  if (!key) {
    throw new Error(
      'Unipile API key is missing. Provide the Unipile API Key in the LinkedIn (Unipile) block.'
    )
  }
  return key
}
