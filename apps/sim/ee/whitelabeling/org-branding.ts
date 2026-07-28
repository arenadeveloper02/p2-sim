import { db } from '@sim/db'
import { organization } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { cache } from 'react'
import type { OrganizationWhitelabelSettings } from '@/lib/branding/types'
import { getSession } from '@/lib/auth'

const logger = createLogger('OrgBranding')

/**
 * Fetch whitelabel settings for an organization from the database.
 * Cached per request so layout metadata and SSR props share one DB read.
 */
export const getOrgWhitelabelSettings = cache(
  async (orgId: string): Promise<OrganizationWhitelabelSettings | null> => {
    try {
      const [org] = await db
        .select({ whitelabelSettings: organization.whitelabelSettings })
        .from(organization)
        .where(eq(organization.id, orgId))
        .limit(1)

      return org?.whitelabelSettings ?? null
    } catch (error) {
      logger.error('Failed to fetch org whitelabel settings', { error, orgId })
      return null
    }
  }
)

/**
 * Whitelabel settings for the session's active organization, when set.
 */
export const getActiveOrgWhitelabelSettings = cache(
  async (): Promise<OrganizationWhitelabelSettings | null> => {
    const session = await getSession()
    const orgId = (session?.session as { activeOrganizationId?: string } | null)
      ?.activeOrganizationId
    if (!orgId) return null
    return getOrgWhitelabelSettings(orgId)
  }
)
