/**
 * Database-driven channel accounts management
 * Fetches accounts from database instead of hardcoded constants
 */

import { db } from '@sim/db'
import { sql } from 'drizzle-orm'

export interface ChannelAccount {
  id: string
  name: string
}

/**
 * Fetches channel accounts from database by type
 *
 * @param type - Account type ('facebook', 'bing', 'google')
 * @returns Promise<Record<string, ChannelAccount>> - Accounts in same format as constants
 */
export async function getChannelAccounts(
  type: 'facebook' | 'bing' | 'google'
): Promise<Record<string, ChannelAccount>> {
  try {
    // Use raw SQL query since channel_accounts table doesn't exist in schema yet
    const result = await db.execute(sql`
      SELECT account_id, account_name 
      FROM channel_accounts 
      WHERE account_type = ${type} 
      ORDER BY account_name
    `)

    // Convert to same format as constants (key: { id, name })
    const accounts: Record<string, ChannelAccount> = {}

    for (const row of result as any[]) {
      // Create a friendly key from account_name (lowercase, replace spaces/special chars with underscore)
      const key = String(row.account_name)
        .toLowerCase()
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars except spaces
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/_+/g, '_') // Replace multiple underscores with single
        .replace(/^_|_$/g, '') // Remove leading/trailing underscores

      accounts[key] = {
        id: String(row.account_id),
        name: String(row.account_name),
      }
    }

    return accounts
  } catch (error) {
    console.error(`Error fetching ${type} accounts from database:`, error)
    return {}
  }
}

/**
 * Fetches Facebook accounts from database
 */
export async function getFacebookAccounts(): Promise<Record<string, ChannelAccount>> {
  return getChannelAccounts('facebook')
}

/**
 * Fetches Bing Ads accounts from database
 */
export async function getBingAdsAccounts(): Promise<Record<string, ChannelAccount>> {
  return getChannelAccounts('bing')
}

/**
 * Fetches Google Ads accounts from database
 */
export async function getGoogleAdsAccounts(): Promise<Record<string, ChannelAccount>> {
  return getChannelAccounts('google')
}
