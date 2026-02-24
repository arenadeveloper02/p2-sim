import { db } from '@sim/db'
import { user, userArenaDetails } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { verifyInternalToken } from '@/lib/auth/internal'
import { getArenaTokenByWorkflowId } from '@/app/api/tools/arena/utils/db-utils'

const logger = createLogger('ArenaGetToken')

export interface ArenaTokenResult {
  found: true
  userId: string
  email: string
  arenaToken: string
}

export interface ArenaTokenNotFound {
  found: false
  reason: string
}

export type ArenaTokenResponse = ArenaTokenResult | ArenaTokenNotFound

const POSITION2_DOMAIN = '@position2.com'

function isAllowedEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(POSITION2_DOMAIN)
}

/**
 * Resolves the authorized user id from session or from internal token + userId (same logic as get-token route).
 */
async function resolveAuthorizedUserId(
  req: NextRequest
): Promise<{ ok: true; userId: string } | { ok: false; body: ArenaTokenNotFound }> {
  const { searchParams } = new URL(req.url)
  const paramUserId = searchParams.get('userId')?.trim()

  const session = await getSession()
  if (session?.user?.id) {
    const sessionUserId = session.user.id
    if (paramUserId && paramUserId !== sessionUserId) {
      return { ok: false, body: { found: false, reason: 'userId param must match logged-in user' } }
    }
    return { ok: true, userId: sessionUserId }
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]
    const verification = await verifyInternalToken(token)
    if (verification.valid) {
      const userId = paramUserId ?? verification.userId
      if (!userId) {
        return {
          ok: false,
          body: { found: false, reason: 'Missing required param: userId (logged-in user)' },
        }
      }
      return { ok: true, userId }
    }
  }

  return {
    ok: false,
    body: { found: false, reason: 'Unauthorized - No session or valid internal token' },
  }
}

/**
 * Resolves the Arena token in-process using the same logic as the get-token route (session or internal token, then DB).
 * No HTTP request to the get-token API.
 */
export async function fetchArenaTokenFromApi(req: NextRequest): Promise<ArenaTokenResponse> {
  const resolved = await resolveAuthorizedUserId(req)
  if (!resolved.ok) {
    return resolved.body
  }
  const userId = resolved.userId

  const userRow = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (userRow.length === 0) {
    return { found: false, reason: 'User not found' }
  }

  const email = userRow[0].email
  if (!email || !isAllowedEmail(email)) {
    logger.warn(`Get token rejected: user email domain not allowed (userId: ${userId})`)
    return { found: false, reason: 'Only @position2.com users are allowed' }
  }

  const details = await db
    .select({ arenaToken: userArenaDetails.arenaToken })
    .from(userArenaDetails)
    .where(eq(userArenaDetails.userIdRef, userId))
    .limit(1)

  if (details.length === 0 || !details[0].arenaToken) {
    return { found: false, reason: 'Arena token not found for user' }
  }

  return {
    found: true,
    userId,
    email,
    arenaToken: details[0].arenaToken,
  }
}

/**
 * Get Arena token: resolve in-process (session or internal token + DB), then fallback to workflow owner via getArenaTokenByWorkflowId when not found.
 */
export async function getArenaToken(
  req: NextRequest,
  workflowId?: string
): Promise<ArenaTokenResponse> {
  let tokenObject = await fetchArenaTokenFromApi(req)
  if (!tokenObject.found && workflowId) {
    const wf = await getArenaTokenByWorkflowId(workflowId)
    if (wf.found) {
      const email =
        (
          await db.select({ email: user.email }).from(user).where(eq(user.id, wf.userId)).limit(1)
        )[0]?.email ?? ''
      tokenObject = { found: true, userId: wf.userId, email, arenaToken: wf.arenaToken }
    } else {
      tokenObject = { found: false, reason: wf.reason }
    }
  }
  return tokenObject
}
