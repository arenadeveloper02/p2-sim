import { db } from '@sim/db'
import { oauthCustomAppState, organizationOauthApps, workspace } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { and, eq, inArray, lt } from 'drizzle-orm'
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
  allowedWorkspaceIds: string[]
  createdAt: Date
  updatedAt: Date
}

export interface OrganizationOAuthAppCredentials {
  clientId: string
  clientSecret: string
}

function normalizeAllowedWorkspaceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter(Boolean)
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

/**
 * Returns the Zoom Admin workspace allowlist for an organization.
 * Empty array means fall back to env `ADMIN_WORKSPACE_IDS`.
 * `null` means the org has no `zoom-admin` app row (same as empty).
 */
export async function getZoomAdminAllowedWorkspaceIds(
  organizationId: string
): Promise<string[] | null> {
  const [row] = await db
    .select({ allowedWorkspaceIds: organizationOauthApps.allowedWorkspaceIds })
    .from(organizationOauthApps)
    .where(
      and(
        eq(organizationOauthApps.organizationId, organizationId),
        eq(organizationOauthApps.providerId, 'zoom-admin')
      )
    )
    .limit(1)

  if (!row) return null
  return normalizeAllowedWorkspaceIds(row.allowedWorkspaceIds)
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
    allowedWorkspaceIds: normalizeAllowedWorkspaceIds(row.allowedWorkspaceIds),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

/**
 * Validates that every workspace ID belongs to the given organization.
 * Returns the normalized ID list, or an error message.
 */
export async function validateOrgWorkspaceAllowlist(
  organizationId: string,
  workspaceIds: string[]
): Promise<{ ok: true; workspaceIds: string[] } | { ok: false; error: string }> {
  const normalized = [...new Set(workspaceIds.map((id) => id.trim()).filter(Boolean))]
  if (normalized.length === 0) {
    return { ok: true, workspaceIds: [] }
  }

  const rows = await db
    .select({ id: workspace.id })
    .from(workspace)
    .where(and(eq(workspace.organizationId, organizationId), inArray(workspace.id, normalized)))

  if (rows.length !== normalized.length) {
    const found = new Set(rows.map((row) => row.id))
    const missing = normalized.filter((id) => !found.has(id))
    return {
      ok: false,
      error: `Workspace IDs are not part of this organization: ${missing.join(', ')}`,
    }
  }

  return { ok: true, workspaceIds: normalized }
}

export async function upsertOrganizationOAuthApp(params: {
  organizationId: string
  appKey: string
  clientId: string
  clientSecret: string
  userId: string
  allowedWorkspaceIds?: string[]
}): Promise<void> {
  const { organizationId, appKey, clientId, clientSecret, userId } = params
  const allowedWorkspaceIds =
    appKey === 'zoom-admin' ? normalizeAllowedWorkspaceIds(params.allowedWorkspaceIds ?? []) : []
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
      allowedWorkspaceIds,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [organizationOauthApps.organizationId, organizationOauthApps.providerId],
      set: {
        clientId,
        clientSecret: encrypted,
        allowedWorkspaceIds,
        updatedAt: now,
      },
    })

  logger.info('Upserted organization custom OAuth app', {
    organizationId,
    appKey,
    allowedWorkspaceCount: allowedWorkspaceIds.length,
  })
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
