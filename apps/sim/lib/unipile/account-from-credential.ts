import { db } from '@sim/db'
import { account, credential } from '@sim/db/schema'
import { isValidUuid } from '@sim/utils/id'
import { and, eq } from 'drizzle-orm'
import { UNIPILE_LINKEDIN_PROVIDER_ID } from '@/lib/unipile/hosted-auth'

/**
 * Resolves a workspace credential id, internal Better Auth `account.id`, or raw Unipile
 * `account_id` to the external Unipile account id used in API calls.
 */
export async function resolveUnipileExternalAccountId(
  credentialOrAccountId: string
): Promise<string | null> {
  const trimmed = credentialOrAccountId.trim()
  if (!trimmed) return null

  if (isValidUuid(trimmed)) {
    const [row] = await db
      .select({
        externalAccountId: account.accountId,
      })
      .from(credential)
      .innerJoin(account, eq(credential.accountId, account.id))
      .where(eq(credential.id, trimmed))
      .limit(1)

    if (row?.externalAccountId) {
      return row.externalAccountId.trim()
    }
    return null
  }

  const [byInternalAccountRow] = await db
    .select({
      externalAccountId: account.accountId,
    })
    .from(account)
    .where(and(eq(account.id, trimmed), eq(account.providerId, UNIPILE_LINKEDIN_PROVIDER_ID)))
    .limit(1)

  if (byInternalAccountRow?.externalAccountId) {
    return byInternalAccountRow.externalAccountId.trim()
  }

  return trimmed
}
