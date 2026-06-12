import { db } from '@sim/db'
import { account, credential, credentialMember, outreachUserConnectionsV1 } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import { UNIPILE_LINKEDIN_PROVIDER_ID } from '@/lib/unipile/hosted-auth'
import { isAdminWorkspace } from '@/lib/workspaces/is-admin-workspace'

const logger = createLogger('UnipileListAccountOptions')

export type UnipileAccountOptionSource = 'public' | 'personal'

export interface UnipileAccountOption {
  id: string
  label: string
  source: UnipileAccountOptionSource
  externalAccountId: string
  credentialId?: string
  canReconnect: boolean
}

function buildOutreachLabel(
  displayName: string,
  email: string | null,
  platformType: string | null
): string {
  const type =
    typeof platformType === 'string' && platformType.trim() !== '' ? platformType.trim() : 'unipile'
  return email ? `${displayName} (${email}) - ${type}` : `${displayName} - ${type}`
}

function mapOutreachRowToOption(
  row: {
    accountId: string | null
    name: string | null
    userEmail: string | null
    platformType: string | null
  },
  source: UnipileAccountOptionSource
): UnipileAccountOption | null {
  const externalAccountId = typeof row.accountId === 'string' ? row.accountId.trim() : ''
  if (!externalAccountId) return null

  const displayName =
    typeof row.name === 'string' && row.name.trim() !== '' ? row.name.trim() : 'Account'
  const email =
    typeof row.userEmail === 'string' && row.userEmail.trim() !== '' ? row.userEmail.trim() : null

  return {
    id: externalAccountId,
    label: buildOutreachLabel(displayName, email, row.platformType),
    source,
    externalAccountId,
    canReconnect: source === 'personal',
  }
}

/**
 * Lists LinkedIn (Unipile) account picker options for a workspace.
 * Admin/shared workspaces receive public outreach accounts plus the caller's personal connections.
 */
export async function listUnipileAccountOptions(params: {
  workspaceId: string
  userId: string
}): Promise<UnipileAccountOption[]> {
  const workspaceId = params.workspaceId.trim()
  const userId = params.userId.trim()
  if (!workspaceId || !userId) {
    return []
  }

  const includePublicCatalog = isAdminWorkspace(workspaceId)
  const personalExternalIds = new Set<string>()
  const items: UnipileAccountOption[] = []

  try {
    const credentialRows = await db
      .select({
        credentialId: credential.id,
        displayName: credential.displayName,
        externalAccountId: account.accountId,
      })
      .from(credential)
      .innerJoin(account, eq(credential.accountId, account.id))
      .innerJoin(
        credentialMember,
        and(
          eq(credentialMember.credentialId, credential.id),
          eq(credentialMember.userId, userId),
          eq(credentialMember.status, 'active')
        )
      )
      .where(
        and(
          eq(credential.workspaceId, workspaceId),
          eq(credential.type, 'oauth'),
          eq(credential.providerId, UNIPILE_LINKEDIN_PROVIDER_ID)
        )
      )

    for (const row of credentialRows) {
      const externalAccountId =
        typeof row.externalAccountId === 'string' ? row.externalAccountId.trim() : ''
      const credentialId = typeof row.credentialId === 'string' ? row.credentialId.trim() : ''
      if (!externalAccountId || !credentialId) continue

      personalExternalIds.add(externalAccountId)
      const displayName =
        typeof row.displayName === 'string' && row.displayName.trim() !== ''
          ? row.displayName.trim()
          : 'LinkedIn account'

      items.push({
        id: credentialId,
        label: displayName,
        source: 'personal',
        externalAccountId,
        credentialId,
        canReconnect: true,
      })
    }

    if (includePublicCatalog) {
      const publicRows = await db
        .select({
          accountId: outreachUserConnectionsV1.accountId,
          name: outreachUserConnectionsV1.name,
          userEmail: outreachUserConnectionsV1.userEmail,
          platformType: outreachUserConnectionsV1.platformType,
        })
        .from(outreachUserConnectionsV1)
        .where(
          and(
            eq(outreachUserConnectionsV1.isShown, true),
            eq(outreachUserConnectionsV1.isConnected, true)
          )
        )

      for (const row of publicRows) {
        const option = mapOutreachRowToOption(row, 'public')
        if (!option) continue
        if (personalExternalIds.has(option.externalAccountId)) continue
        items.push(option)
      }

      const privateOutreachRows = await db
        .select({
          accountId: outreachUserConnectionsV1.accountId,
          name: outreachUserConnectionsV1.name,
          userEmail: outreachUserConnectionsV1.userEmail,
          platformType: outreachUserConnectionsV1.platformType,
        })
        .from(outreachUserConnectionsV1)
        .where(
          and(
            eq(outreachUserConnectionsV1.isShown, false),
            eq(outreachUserConnectionsV1.isConnected, true),
            eq(outreachUserConnectionsV1.userIdRef, userId)
          )
        )

      for (const row of privateOutreachRows) {
        const option = mapOutreachRowToOption(row, 'personal')
        if (!option) continue
        if (personalExternalIds.has(option.externalAccountId)) continue
        personalExternalIds.add(option.externalAccountId)
        items.push(option)
      }
    }

    items.sort((left, right) => {
      if (left.source !== right.source) {
        return left.source === 'public' ? -1 : 1
      }
      return left.label.localeCompare(right.label)
    })

    return items
  } catch (error) {
    logger.error('Failed to list Unipile account options', { error, workspaceId, userId })
    return []
  }
}
