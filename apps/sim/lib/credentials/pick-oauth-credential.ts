/**
 * Google Workspace OAuth providers that share Drive scopes. A connected Docs
 * account can authorize Drive list/search (and vice versa).
 */
export const GOOGLE_DRIVE_SCOPE_PROVIDERS = new Set([
  'google-drive',
  'google-docs',
  'google-sheets',
  'google-slides',
  'google-forms',
])

export interface OAuthCredentialPickInput {
  providerId: string
  /** True when this credential belongs to the signed-in user. */
  isOwn?: boolean
  /** OAuth account owner; compared to `userId` when `isOwn` is omitted. */
  ownerUserId?: string | null
  updatedAt?: Date
}

function belongsToUser(credential: OAuthCredentialPickInput, userId?: string): boolean {
  if (credential.isOwn === true) return true
  if (userId && credential.ownerUserId) return credential.ownerUserId === userId
  return false
}

function matchingProviderCredentials<T extends OAuthCredentialPickInput>(
  credentials: T[],
  provider: string
): T[] {
  const exact = credentials.filter((credential) => credential.providerId === provider)
  if (exact.length > 0) return exact
  if (!GOOGLE_DRIVE_SCOPE_PROVIDERS.has(provider)) return []
  return credentials.filter((credential) => GOOGLE_DRIVE_SCOPE_PROVIDERS.has(credential.providerId))
}

function byRecencyThenStable<T extends OAuthCredentialPickInput>(a: T, b: T): number {
  const aTime = a.updatedAt?.getTime() ?? 0
  const bTime = b.updatedAt?.getTime() ?? 0
  return bTime - aTime
}

/**
 * Picks an OAuth credential for a provider.
 * Prefers the signed-in user's own connection. Does not guess among teammates'
 * accounts when the user has none of their own and more than one is accessible.
 */
export function pickPreferredOAuthCredential<T extends OAuthCredentialPickInput>(
  credentials: T[],
  provider: string,
  userId?: string
): T | undefined {
  const matches = matchingProviderCredentials(credentials, provider)
  if (matches.length === 0) return undefined

  const own = matches.filter((credential) => belongsToUser(credential, userId))
  if (own.length === 1) return own[0]
  if (own.length > 1) return [...own].sort(byRecencyThenStable)[0]
  if (matches.length === 1) return matches[0]
  return undefined
}
