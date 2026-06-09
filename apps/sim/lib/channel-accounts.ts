/**
 * Database-driven channel accounts management
 * Fetches accounts from database instead of hardcoded constants
 */

import { db } from '@sim/db'
import { createLogger } from '@sim/logger'
import { sql } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/core/config/env'

const logger = createLogger('ChannelAccounts')

export interface ChannelAccount {
  id: string
  name: string
}

interface ChannelAccountRow {
  account_id: string
  account_name: string
}

/**
 * Parses `ANALYTICS_WORKSPACE_IDS` from env as a JSON array or comma-separated list.
 */
function parseAnalyticsWorkspaceIds(): string[] {
  const raw = env.ANALYTICS_WORKSPACE_IDS
  if (!raw) return []

  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
      }
    } catch {
      logger.warn('Failed to parse ANALYTICS_WORKSPACE_IDS as JSON array')
    }
  }

  return trimmed
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

/**
 * Returns whether the workspace has access to the full shared channel account catalog.
 */
export function isAnalyticsWorkspace(workspaceId?: string): boolean {
  if (!workspaceId) return false
  return parseAnalyticsWorkspaceIds().includes(workspaceId)
}

function toAccountKey(accountName: string): string {
  return accountName
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function mapRowsToAccounts(rows: ChannelAccountRow[]): Record<string, ChannelAccount> {
  const accounts: Record<string, ChannelAccount> = {}

  for (const row of rows) {
    const key = toAccountKey(String(row.account_name))
    accounts[key] = {
      id: String(row.account_id),
      name: String(row.account_name),
    }
  }

  return accounts
}

/**
 * Fetches channel accounts from database by type.
 * Analytics workspaces receive the full shared catalog; other workspaces receive none.
 *
 * @param type - Account type ('facebook', 'bing', 'google')
 * @param workspaceId - Current workspace ID used for access control
 * @returns Accounts in the same format as legacy constants
 */
export async function getChannelAccounts(
  type: 'facebook' | 'bing' | 'google',
  workspaceId?: string
): Promise<Record<string, ChannelAccount>> {
  try {
    if (!workspaceId) {
      return {}
    }

    if (isAnalyticsWorkspace(workspaceId)) {
      const result = await db.execute(sql`
        SELECT account_id, account_name 
        FROM channel_accounts 
        WHERE account_type = ${type} 
        ORDER BY account_name
      `)
      return mapRowsToAccounts(result as unknown as ChannelAccountRow[])
    }

    const session = await getSession()
    const userId = session?.user?.id
    if (!userId) {
      logger.warn('No authenticated user for workspace-scoped channel accounts', { workspaceId })
      return {}
    }

    const mappedResult = await db.execute(sql`
      SELECT ca.account_id, ca.account_name 
      FROM channel_accounts ca
      WHERE ca.account_type = ${type}
        AND ca.account_id IN (
          SELECT cam.sub_account_id
          FROM client_analytics_account_mapping cam
          WHERE cam.workspace_id_ref = ${workspaceId}
        )
        or ca.account_id IN (
          select distinct sub_account_id from client_analytics_account_mapping where workspace_id_ref IN (
          SELECT w.id
          FROM permissions p
          INNER JOIN workspace w ON p.entity_id = w.id
          WHERE p.user_id = ${userId}
            AND p.entity_type = 'workspace'
            AND w.archived_at IS NULL
    ))
      ORDER BY ca.account_name
    `)

    return mapRowsToAccounts(mappedResult as unknown as ChannelAccountRow[])
  } catch (error) {
    logger.error(`Error fetching ${type} accounts from database`, { error, workspaceId })
    return {}
  }
}

/**
 * Fetches Google Ads accounts from database for the current workspace.
 */
export async function getGoogleAdsAccounts(
  workspaceId?: string
): Promise<Record<string, ChannelAccount>> {
  return getChannelAccounts('google', workspaceId)
}

/**
 * Fetches Facebook Ads accounts from database (facebook_accounts table)
 */
export async function getFacebookAdsAccounts(): Promise<Record<string, ChannelAccount>> {
  try {
    const result = await db.execute(sql`
      SELECT account_id, account_name 
      FROM facebook_accounts 
      ORDER BY account_name
    `)

    const accounts: Record<string, ChannelAccount> = {}

    for (const row of result as unknown as Array<{ account_id: string; account_name: string }>) {
      const key = String(row.account_name)
        .toLowerCase()
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')

      accounts[key] = {
        id: String(row.account_id),
        name: String(row.account_name),
      }
    }

    return accounts
  } catch (error) {
    console.error('Error fetching facebook accounts from database:', error)
    return {}
  }
}
