import { db } from '@sim/db'
import { localCopilotUserAccess } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { assertLocalCopilotEnabled, getLocalCopilotConfig } from '@/local-copilot/lib/config'

const logger = createLogger('LocalCopilotAccess')

/**
 * Returns true when the user has an allowlist row with `hasAccess = true`
 * and Arena Copilot is enabled for the deployment.
 * Missing row, revoked access, or DB errors deny access (fail closed).
 */
export async function isUserAllowedForLocalCopilot(
  userId: string | undefined | null
): Promise<boolean> {
  const config = getLocalCopilotConfig()
  if (!config.enabled) return false
  if (!userId?.trim()) return false

  try {
    const [row] = await db
      .select({ hasAccess: localCopilotUserAccess.hasAccess })
      .from(localCopilotUserAccess)
      .where(
        and(eq(localCopilotUserAccess.userId, userId), eq(localCopilotUserAccess.hasAccess, true))
      )
      .limit(1)

    return Boolean(row)
  } catch (error) {
    logger.error('Failed to check Arena Copilot user access; denying', {
      userId,
      error: getErrorMessage(error),
    })
    return false
  }
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
