import { NextResponse } from 'next/server'
import {
  assertLocalCopilotEnabled,
  isUserAllowedForLocalCopilot,
} from '@/local-copilot/lib/config'

/**
 * Per-user local copilot access (deployment enabled + optional email allowlist).
 */
export function isLocalCopilotEnabledForUser(userEmail: string | undefined | null): boolean {
  return isUserAllowedForLocalCopilot(userEmail)
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
export function requireLocalCopilotUserAccess(
  userEmail: string | undefined | null
): NextResponse | null {
  if (!isUserAllowedForLocalCopilot(userEmail)) {
    return localCopilotUserAccessDeniedResponse()
  }
  return null
}

/**
 * Ensures local copilot is enabled for the deployment and the signed-in user.
 */
export function requireLocalCopilotAccess(
  userEmail: string | undefined | null
): NextResponse | null {
  try {
    assertLocalCopilotEnabled()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Arena Copilot is disabled'
    return NextResponse.json({ error: message }, { status: 503 })
  }

  return requireLocalCopilotUserAccess(userEmail)
}
