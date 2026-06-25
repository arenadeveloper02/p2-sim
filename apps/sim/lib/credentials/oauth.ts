import { db } from '@sim/db'
import { account, credential, credentialMember } from '@sim/db/schema'
import { generateId } from '@sim/utils/id'
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { ensureBilledAccountCredentialMembership } from '@/lib/credentials/access'
import { getServiceConfigByProviderId } from '@/lib/oauth'

/** Provider IDs that are not real OAuth integrations (login-only social providers and password) */
const NON_OAUTH_PROVIDER_IDS = ['credential', 'google', 'github'] as const

interface SyncWorkspaceOAuthCredentialsForUserParams {
  workspaceId: string
  userId: string
}

export interface UserOAuthCredentialRecord {
  id: string
  providerId: string
  displayName: string
  updatedAt: Date
}

/**
 * Returns workspace OAuth credentials linked to the given user's own OAuth accounts.
 * Unlike `getAccessibleOAuthCredentials`, this never includes other members' credentials
 * when the caller is a workspace admin.
 */
export async function getWorkspaceOAuthCredentialsForUserProvider(params: {
  workspaceId: string
  userId: string
  providerId: string
}): Promise<UserOAuthCredentialRecord[]> {
  const { workspaceId, userId, providerId } = params

  const userAccounts = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))

  if (userAccounts.length === 0) {
    return []
  }

  const accountIds = userAccounts.map((row) => row.id)

  const rows = await db
    .select({
      id: credential.id,
      providerId: credential.providerId,
      displayName: credential.displayName,
      updatedAt: credential.updatedAt,
    })
    .from(credential)
    .where(
      and(
        eq(credential.workspaceId, workspaceId),
        eq(credential.type, 'oauth'),
        eq(credential.providerId, providerId),
        inArray(credential.accountId, accountIds)
      )
    )

  return rows.filter((row): row is UserOAuthCredentialRecord => Boolean(row.providerId))
}

interface SyncWorkspaceOAuthCredentialsForUserResult {
  updatedMemberships: number
}

function getPostgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const err = error as { code?: string; cause?: { code?: string } }
  return err.code || err.cause?.code
}

/**
 * Normalizes display names and ensures credential memberships for existing
 * workspace-scoped OAuth credentials. Does not create new credentials —
 * credential creation is handled by the draft-based OAuth connect flow.
 */
export async function syncWorkspaceOAuthCredentialsForUser(
  params: SyncWorkspaceOAuthCredentialsForUserParams
): Promise<SyncWorkspaceOAuthCredentialsForUserResult> {
  const { workspaceId, userId } = params

  const userAccounts = await db
    .select({
      id: account.id,
      providerId: account.providerId,
      accountId: account.accountId,
    })
    .from(account)
    .where(
      and(eq(account.userId, userId), notInArray(account.providerId, [...NON_OAUTH_PROVIDER_IDS]))
    )

  if (userAccounts.length === 0) {
    return { updatedMemberships: 0 }
  }

  const accountIds = userAccounts.map((row) => row.id)
  const existingCredentials = await db
    .select({
      id: credential.id,
      displayName: credential.displayName,
      providerId: credential.providerId,
      accountId: credential.accountId,
    })
    .from(credential)
    .where(
      and(
        eq(credential.workspaceId, workspaceId),
        eq(credential.type, 'oauth'),
        inArray(credential.accountId, accountIds)
      )
    )

  const now = new Date()
  const userAccountById = new Map(userAccounts.map((row) => [row.id, row]))
  for (const existingCredential of existingCredentials) {
    if (!existingCredential.accountId) continue
    const linkedAccount = userAccountById.get(existingCredential.accountId)
    if (!linkedAccount) continue

    const normalizedLabel =
      getServiceConfigByProviderId(linkedAccount.providerId)?.name || linkedAccount.providerId
    const shouldNormalizeDisplayName =
      existingCredential.displayName === linkedAccount.accountId ||
      existingCredential.displayName === linkedAccount.providerId

    if (!shouldNormalizeDisplayName || existingCredential.displayName === normalizedLabel) {
      continue
    }

    await db
      .update(credential)
      .set({
        displayName: normalizedLabel,
        updatedAt: now,
      })
      .where(eq(credential.id, existingCredential.id))
  }

  const credentialRows = await db
    .select({ id: credential.id, accountId: credential.accountId })
    .from(credential)
    .where(
      and(
        eq(credential.workspaceId, workspaceId),
        eq(credential.type, 'oauth'),
        inArray(credential.accountId, accountIds)
      )
    )

  const credentialIdByAccountId = new Map(
    credentialRows.filter((row) => Boolean(row.accountId)).map((row) => [row.accountId!, row.id])
  )
  const allCredentialIds = Array.from(credentialIdByAccountId.values())
  if (allCredentialIds.length === 0) {
    return { updatedMemberships: 0 }
  }

  const existingMemberships = await db
    .select({
      id: credentialMember.id,
      credentialId: credentialMember.credentialId,
      joinedAt: credentialMember.joinedAt,
    })
    .from(credentialMember)
    .where(
      and(
        inArray(credentialMember.credentialId, allCredentialIds),
        eq(credentialMember.userId, userId)
      )
    )

  const membershipByCredentialId = new Map(
    existingMemberships.map((row) => [row.credentialId, row])
  )
  let updatedMemberships = 0

  for (const credentialId of allCredentialIds) {
    const existingMembership = membershipByCredentialId.get(credentialId)
    if (existingMembership) {
      await db
        .update(credentialMember)
        .set({
          role: 'admin',
          status: 'active',
          joinedAt: existingMembership.joinedAt ?? now,
          invitedBy: userId,
          updatedAt: now,
        })
        .where(eq(credentialMember.id, existingMembership.id))
      updatedMemberships += 1
      await ensureBilledAccountCredentialMembership({
        credentialId,
        workspaceId,
        invitedBy: userId,
      })
      continue
    }

    try {
      await db.insert(credentialMember).values({
        id: generateId(),
        credentialId,
        userId,
        role: 'admin',
        status: 'active',
        joinedAt: now,
        invitedBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      updatedMemberships += 1
    } catch (error) {
      if (getPostgresErrorCode(error) !== '23505') {
        throw error
      }
    }

    await ensureBilledAccountCredentialMembership({
      credentialId,
      workspaceId,
      invitedBy: userId,
    })
  }

  return { updatedMemberships }
}
