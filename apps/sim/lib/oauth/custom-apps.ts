import { db } from '@sim/db'
import { oauthCustomAppState, organizationOauthApps } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { and, eq, lt } from 'drizzle-orm'
import { decryptSecret, encryptSecret } from '@/lib/core/security/encryption'

const logger = createLogger('CustomOAuthApps')

/**
 * Describes a provider that supports an organization-scoped "bring your own
 * OAuth app" — the org registers its own client id/secret instead of using
 * Sim's shared app, and every workspace under that org authorizes against
 * the org's own app registration.
 *
 * Keyed by the OAuth **service** `providerId` (the id stored on `account`/
 * `credential` rows, e.g. `'zoom'` or `'zoom-admin'`). `appKey` is the row
 * key in `organization_oauth_apps.provider_id` — sibling services that read
 * the same underlying app registration (e.g. Zoom's user app and admin app
 * are the same Marketplace app, just requesting different scopes) share one
 * `appKey` so an org only has to register the app once.
 */
export interface CustomOAuthAppProviderConfig {
  appKey: string
  authorizationUrl: string
  tokenUrl: string
  userInfoUrl?: string
  authentication: 'basic' | 'post'
  supportsRefreshTokenRotation?: boolean
}

export const CUSTOM_OAUTH_APP_PROVIDERS: Record<string, CustomOAuthAppProviderConfig> = {
  zoom: {
    appKey: 'zoom',
    authorizationUrl: 'https://zoom.us/oauth/authorize',
    tokenUrl: 'https://zoom.us/oauth/token',
    userInfoUrl: 'https://api.zoom.us/v2/users/me',
    authentication: 'basic',
    supportsRefreshTokenRotation: true,
  },
  'zoom-admin': {
    // Shares the same Zoom Marketplace app/org row as `zoom` — an org
    // registers one app and grants it both scope sets.
    appKey: 'zoom',
    authorizationUrl: 'https://zoom.us/oauth/authorize',
    tokenUrl: 'https://zoom.us/oauth/token',
    userInfoUrl: 'https://api.zoom.us/v2/users/me',
    authentication: 'basic',
    supportsRefreshTokenRotation: true,
  },
}

/** True when `providerId` only works through an organization-scoped custom app (no shared fallback). */
export function requiresCustomOAuthApp(providerId: string): boolean {
  return providerId in CUSTOM_OAUTH_APP_PROVIDERS
}

export function getCustomOAuthAppConfig(
  providerId: string
): CustomOAuthAppProviderConfig | undefined {
  return CUSTOM_OAUTH_APP_PROVIDERS[providerId]
}

/** Distinct app keys across all custom-app-capable providers, for settings UI listing. */
export function listCustomOAuthAppKeys(): string[] {
  return Array.from(new Set(Object.values(CUSTOM_OAUTH_APP_PROVIDERS).map((c) => c.appKey)))
}

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
