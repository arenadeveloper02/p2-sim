import { db } from '@sim/db'
import { localCopilotUserAccess } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { assertLocalCopilotEnabled, getLocalCopilotConfig } from '@/local-copilot/lib/config'

const logger = createLogger('LocalCopilotAccess')

/**
 * Resolved Arena Copilot access flags for a user.
 *
 * - `hasAccess` — user may use Local and switch to Cloud (both options shown).
 * - `localOnly` — user is restricted to Local; the switch is hidden and the
 *   backend is forced to `local`. Takes precedence over `hasAccess`.
 */
export interface LocalCopilotUserAccess {
  hasAccess: boolean
  localOnly: boolean
}

const DENIED_ACCESS: LocalCopilotUserAccess = { hasAccess: false, localOnly: false }

/**
 * Reads the user's Arena Copilot allowlist row. Deployment disabled, missing
 * user id, missing row, or DB errors all deny access (fail closed).
 */
export async function getLocalCopilotUserAccess(
  userId: string | undefined | null
): Promise<LocalCopilotUserAccess> {
  const config = getLocalCopilotConfig()
  if (!config.enabled) return DENIED_ACCESS
  if (!userId?.trim()) return DENIED_ACCESS

  try {
    const [row] = await db
      .select({
        hasAccess: localCopilotUserAccess.hasAccess,
        localOnly: localCopilotUserAccess.localOnly,
      })
      .from(localCopilotUserAccess)
      .where(eq(localCopilotUserAccess.userId, userId))
      .limit(1)

    if (!row) return DENIED_ACCESS
    return { hasAccess: Boolean(row.hasAccess), localOnly: Boolean(row.localOnly) }
  } catch (error) {
    logger.error('Failed to check Arena Copilot user access; denying', {
      userId,
      error: getErrorMessage(error),
    })
    return DENIED_ACCESS
  }
}

/**
 * Returns true when the user may use the Local copilot at all — either full
 * access (`hasAccess`) or local-restricted access (`localOnly`).
 */
export async function isUserAllowedForLocalCopilot(
  userId: string | undefined | null
): Promise<boolean> {
  const { hasAccess, localOnly } = await getLocalCopilotUserAccess(userId)
  return hasAccess || localOnly
}

/**
 * Per-user local copilot access (deployment enabled + DB allowlist).
 */
export async function isLocalCopilotEnabledForUser(
  userId: string | undefined | null
): Promise<boolean> {
  return isUserAllowedForLocalCopilot(userId)
}

export function localCopilotUserAccessDeniedResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Arena Copilot is not enabled for your account. Using external copilot.' },
    { status: 403 }
  )
}

/**
 * Returns a 403 response when the user is not on the local copilot allowlist.
 */
export async function requireLocalCopilotUserAccess(
  userId: string | undefined | null
): Promise<NextResponse | null> {
  if (!(await isUserAllowedForLocalCopilot(userId))) {
    return localCopilotUserAccessDeniedResponse()
  }
  return null
}

/**
 * Ensures local copilot is enabled for the deployment and the signed-in user.
 */
export async function requireLocalCopilotAccess(
  userId: string | undefined | null
): Promise<NextResponse | null> {
  try {
    assertLocalCopilotEnabled()
  } catch (error) {
    const message = getErrorMessage(error, 'Arena Copilot is disabled')
    return NextResponse.json({ error: message }, { status: 503 })
  }

  return requireLocalCopilotUserAccess(userId)
}
