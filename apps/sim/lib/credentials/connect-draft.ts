import { db } from '@sim/db'
import { pendingCredentialDraft, user } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { and, eq, lt } from 'drizzle-orm'
import { getAllOAuthServices } from '@/lib/oauth/utils'

const logger = createLogger('ConnectDraft')

const DRAFT_TTL_MS = 15 * 60 * 1000

/**
 * Creates the pending credential draft at click time so its TTL starts when the
 * user actually initiates the connect. Better Auth's `account.create.after` hook
 * (and custom OAuth flows that call `processCredentialDraft` directly — Shopify,
 * Trello, and the org-scoped custom-app flow for Zoom) consumes this draft to
 * materialize the real credential after the OAuth callback; starting the clock
 * here guarantees the draft outlives the (≤5 min) OAuth round-trip rather than
 * expiring mid-flow and silently producing no credential.
 */
export async function createConnectDraft(params: {
  userId: string
  workspaceId: string
  providerId: string
}): Promise<void> {
  const { userId, workspaceId, providerId } = params

  const service = getAllOAuthServices().find((s) => s.providerId === providerId)
  const serviceName = service?.name ?? providerId

  let displayName = serviceName
  try {
    const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId))
    if (row?.name) {
      displayName = `${row.name}'s ${serviceName}`
    }
  } catch {
    // Fall back to service name only
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + DRAFT_TTL_MS)
  await db
    .delete(pendingCredentialDraft)
    .where(
      and(eq(pendingCredentialDraft.userId, userId), lt(pendingCredentialDraft.expiresAt, now))
    )
  await db
    .insert(pendingCredentialDraft)
    .values({
      id: generateId(),
      userId,
      workspaceId,
      providerId,
      displayName,
      expiresAt,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [
        pendingCredentialDraft.userId,
        pendingCredentialDraft.providerId,
        pendingCredentialDraft.workspaceId,
      ],
      set: { displayName, expiresAt, createdAt: now },
    })

  logger.info('Created OAuth connect credential draft', { userId, workspaceId, providerId })
}
