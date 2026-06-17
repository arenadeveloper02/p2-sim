import { db } from '@sim/db'
import { credential, credentialMember } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import {
  formatHubSpotAliasLabel,
  isHubSpotSharedAccountAlias,
  listHubSpotEnvConfiguredAliases,
  listHubSpotSharedAccountAliases,
} from '@/lib/hubspot/env-aliases'
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

export {
  formatHubSpotAliasLabel,
  isHubSpotSharedAccountAlias,
  listHubSpotEnvConfiguredAliases,
  listHubSpotSharedAccountAliases,
}

/**
 * Lists HubSpot account picker options for a workspace.
 * Admin workspaces receive default shared portals, env-configured aliases, and the caller's personal connections only.
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
      for (const alias of listHubSpotSharedAccountAliases()) {
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
