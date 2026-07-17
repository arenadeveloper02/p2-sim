import { db } from '@sim/db'
import { oauthCustomAppState, organizationOauthApps } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { and, eq, lt } from 'drizzle-orm'
import { decryptSecret, encryptSecret } from '@/lib/core/security/encryption'

const logger = createLogger('CustomOAuthApps')

/**
 * Non-secret metadata returned when listing an organization's OAuth apps.
 */
export interface OrganizationOAuthAppSummary {
  id: string
  organizationId: string
  appKey: string
  clientId: string
  createdAt: Date
  updatedAt: Date
}

export interface OrganizationOAuthAppCredentials {
  clientId: string
  clientSecret: string
}

/**
 * Loads and decrypts an organization's custom OAuth app for `appKey`.
 * Returns `null` when the org hasn't configured one.
 */
export async function getOrganizationOAuthApp(
  organizationId: string,
  appKey: string
): Promise<OrganizationOAuthAppCredentials | null> {
  const [row] = await db
    .select()
    .from(organizationOauthApps)
    .where(
      and(
        eq(organizationOauthApps.organizationId, organizationId),
        eq(organizationOauthApps.providerId, appKey)
      )
    )
    .limit(1)

  if (!row) return null

  const { decrypted } = await decryptSecret(row.clientSecret)
  return { clientId: row.clientId, clientSecret: decrypted }
}

/** Lists an organization's custom OAuth apps without decrypting secrets (for settings UI). */
export async function listOrganizationOAuthApps(
  organizationId: string
): Promise<OrganizationOAuthAppSummary[]> {
  const rows = await db
    .select()
    .from(organizationOauthApps)
    .where(eq(organizationOauthApps.organizationId, organizationId))

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    appKey: row.providerId,
    clientId: row.clientId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

export async function upsertOrganizationOAuthApp(params: {
  organizationId: string
  appKey: string
  clientId: string
  clientSecret: string
  userId: string
}): Promise<void> {
  const { organizationId, appKey, clientId, clientSecret, userId } = params
  const { encrypted } = await encryptSecret(clientSecret)
  const now = new Date()

  await db
    .insert(organizationOauthApps)
    .values({
      id: generateId(),
      organizationId,
      providerId: appKey,
      clientId,
      clientSecret: encrypted,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [organizationOauthApps.organizationId, organizationOauthApps.providerId],
      set: { clientId, clientSecret: encrypted, updatedAt: now },
    })

  logger.info('Upserted organization custom OAuth app', { organizationId, appKey })
}

export async function deleteOrganizationOAuthApp(
  organizationId: string,
  appKey: string
): Promise<void> {
  await db
    .delete(organizationOauthApps)
    .where(
      and(
        eq(organizationOauthApps.organizationId, organizationId),
        eq(organizationOauthApps.providerId, appKey)
      )
    )

  logger.info('Deleted organization custom OAuth app', { organizationId, appKey })
}

/**
 * TTL for the correlation state minted by the custom authorize route. Kept
 * short since it only needs to outlive the redirect round-trip to the
 * provider and back, mirroring `DRAFT_TTL_MS` in the generic authorize route.
 */
const CUSTOM_APP_STATE_TTL_MS = 15 * 60 * 1000

export interface CustomOAuthAppStateRecord {
  providerId: string
  organizationId: string
  workspaceId: string
  userId: string
  returnUrl: string | null
}

/**
 * Mints and persists a single-use, short-lived state token correlating a
 * custom OAuth app authorize request to the workspace/organization/user that
 * initiated it, so the callback can resolve the right org's app without a
 * cookie round-trip. Opportunistically sweeps expired rows on each call.
 */
export async function createCustomOAuthAppState(params: {
  providerId: string
  organizationId: string
  workspaceId: string
  userId: string
  returnUrl?: string
}): Promise<string> {
  const { providerId, organizationId, workspaceId, userId, returnUrl } = params
  const state = generateId()
  const now = new Date()

  await db.delete(oauthCustomAppState).where(lt(oauthCustomAppState.expiresAt, now))

  await db.insert(oauthCustomAppState).values({
    id: generateId(),
    state,
    providerId,
    organizationId,
    workspaceId,
    userId,
    returnUrl: returnUrl ?? null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + CUSTOM_APP_STATE_TTL_MS),
  })

  return state
}

/**
 * Looks up and deletes (single-use) the state row for `state`. Returns `null`
 * when the token is missing, already consumed, or expired.
 */
export async function consumeCustomOAuthAppState(
  state: string
): Promise<CustomOAuthAppStateRecord | null> {
  const [row] = await db
    .select()
    .from(oauthCustomAppState)
    .where(eq(oauthCustomAppState.state, state))
    .limit(1)

  if (!row) return null

  await db.delete(oauthCustomAppState).where(eq(oauthCustomAppState.id, row.id))

  if (row.expiresAt < new Date()) {
    logger.warn('Custom OAuth app state expired', { providerId: row.providerId })
    return null
  }

  return {
    providerId: row.providerId,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    userId: row.userId,
    returnUrl: row.returnUrl,
  }
}
