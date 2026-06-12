import { db } from '@sim/db'
import { accountTokens, credential, credentialMember } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, isNotNull } from 'drizzle-orm'
import { isAdminWorkspace } from '@/lib/workspaces/is-admin-workspace'

const logger = createLogger('HubSpotListAccountOptions')

export type HubSpotAccountOptionSource = 'public' | 'personal'

export interface HubSpotAccountOption {
  id: string
  label: string
  source: HubSpotAccountOptionSource
  alias?: string
  credentialId?: string
}

/** Known shared HubSpot portal aliases and display labels (legacy static picker). */
export const HUBSPOT_SHARED_ACCOUNT_LABELS: Record<string, string> = {
  position2: 'Position2',
  northstar_anesthesia: 'Northstar Anesthesia',
  covalent_metrology: 'Covalent Metrology',
}

export const HUBSPOT_SHARED_ACCOUNT_ALIASES = Object.keys(HUBSPOT_SHARED_ACCOUNT_LABELS)

export function formatHubSpotAliasLabel(alias: string): string {
  const trimmed = alias.trim()
  if (!trimmed) return 'HubSpot account'
  return (
    HUBSPOT_SHARED_ACCOUNT_LABELS[trimmed] ??
    trimmed
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  )
}

/**
 * Lists HubSpot account picker options for a workspace.
 * Admin/shared workspaces receive public `account_tokens` aliases plus the caller's personal connections.
 */
export async function listHubSpotAccountOptions(params: {
  workspaceId: string
  userId: string
}): Promise<HubSpotAccountOption[]> {
  const workspaceId = params.workspaceId.trim()
  const userId = params.userId.trim()
  if (!workspaceId || !userId) {
    return []
  }

  const includePublicCatalog = isAdminWorkspace(workspaceId)
  const personalCredentialIds = new Set<string>()
  const items: HubSpotAccountOption[] = []

  try {
    const credentialRows = await db
      .select({
        credentialId: credential.id,
        displayName: credential.displayName,
      })
      .from(credential)
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
          eq(credential.providerId, 'hubspot')
        )
      )

    for (const row of credentialRows) {
      const credentialId = typeof row.credentialId === 'string' ? row.credentialId.trim() : ''
      if (!credentialId) continue

      personalCredentialIds.add(credentialId)
      const displayName =
        typeof row.displayName === 'string' && row.displayName.trim() !== ''
          ? row.displayName.trim()
          : 'HubSpot account'

      items.push({
        id: credentialId,
        label: displayName,
        source: 'personal',
        credentialId,
      })
    }

    if (includePublicCatalog) {
      const publicRows = await db
        .select({ alias: accountTokens.alias })
        .from(accountTokens)
        .where(and(eq(accountTokens.providerId, 'hubspot'), isNotNull(accountTokens.alias)))

      const seenAliases = new Set<string>()
      for (const row of publicRows) {
        const alias = typeof row.alias === 'string' ? row.alias.trim() : ''
        if (!alias || seenAliases.has(alias)) continue
        seenAliases.add(alias)
        items.push({
          id: alias,
          label: formatHubSpotAliasLabel(alias),
          source: 'public',
          alias,
        })
      }

      for (const alias of HUBSPOT_SHARED_ACCOUNT_ALIASES) {
        if (seenAliases.has(alias)) continue
        items.push({
          id: alias,
          label: formatHubSpotAliasLabel(alias),
          source: 'public',
          alias,
        })
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
    logger.error('Failed to list HubSpot account options', { error, workspaceId, userId })
    return []
  }
}
