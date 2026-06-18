import { db } from '@sim/db'
import { pendingCredentialDraft } from '@sim/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { resolveUnipileExternalAccountId } from '@/lib/unipile/account-from-credential'
import { UNIPILE_LINKEDIN_PROVIDER_ID } from '@/lib/unipile/hosted-auth'

export interface ResolveUnipileReconnectExternalAccountIdParams {
  userId: string
  workspaceId?: string | null
  credentialId?: string | null
}

/**
 * Resolves the external Unipile account id for a reconnect hosted-auth link from an explicit
 * credential id or the user’s pending credential draft.
 */
export async function resolveUnipileReconnectExternalAccountId(
  params: ResolveUnipileReconnectExternalAccountIdParams
): Promise<string | null> {
  const credentialId = params.credentialId?.trim()
  if (credentialId) {
    return resolveUnipileExternalAccountId(credentialId)
  }

  const conditions = [
    eq(pendingCredentialDraft.userId, params.userId),
    eq(pendingCredentialDraft.providerId, UNIPILE_LINKEDIN_PROVIDER_ID),
    sql`${pendingCredentialDraft.expiresAt} > NOW()`,
    sql`${pendingCredentialDraft.credentialId} IS NOT NULL`,
  ]

  const workspaceId = params.workspaceId?.trim()
  if (workspaceId) {
    conditions.push(eq(pendingCredentialDraft.workspaceId, workspaceId))
  }

  const [draft] = await db
    .select({ credentialId: pendingCredentialDraft.credentialId })
    .from(pendingCredentialDraft)
    .where(and(...conditions))
    .limit(1)

  if (!draft?.credentialId) {
    return null
  }

  return resolveUnipileExternalAccountId(draft.credentialId)
}
