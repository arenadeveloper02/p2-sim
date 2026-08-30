import { db } from '@sim/db'
import { deployedApp } from '@sim/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import type { NextRequest, NextResponse } from 'next/server'
import {
  actionChatProtocolFrom,
  actionHiddenInputsFrom,
  actionHostKeysFrom,
} from '@/lib/arena-generative-ui/binding-layout-plan'
import {
  ARENA_ACCESS_DENIED_MESSAGE,
  resolveArenaEmailIdFromRequest,
  shouldDenyMissingArenaEmailId,
} from '@/lib/arena-generative-ui/email-gate'
import { parseArenaGenerativeTheme } from '@/lib/arena-generative-ui/theme'
import {
  type ArenaGenerativeApiBinding,
  type ArenaGenerativeAppManifest,
  actionNavigateFrom,
  pageOnLoadFrom,
  streamingActionIdsFrom,
} from '@/lib/arena-generative-ui/types'
import { compileGenerativeUx } from '@/lib/arena-generative-ui/ux-compiler'
import { setDeploymentAuthCookie } from '@/lib/core/security/deployment'
import {
  type DeploymentAuthResult,
  validateDeploymentAuth,
} from '@/lib/core/security/deployment-auth'
import { generateRequestId } from '@/lib/core/utils/request'
import { createErrorResponse } from '@/app/api/workflows/utils'

export interface DeployedAppRecord {
  id: string
  workspaceId: string
  workflowId: string
  userId: string
  identifier: string
  title: string
  description: string | null
  department: string | null
  isActive: boolean
  authType: string | null
  password: string | null
  allowedEmails: unknown
  requireArenaEmailId: boolean
  draftId: string | null
  revisionId: string | null
  manifest: ArenaGenerativeAppManifest
  apiBindings: ArenaGenerativeApiBinding[]
  httpAllowlist: string[]
}

export function pageSummariesFromManifest(manifest: ArenaGenerativeAppManifest) {
  return Object.values(manifest.pages).map((page) => ({
    path: page.path,
    title: page.title,
  }))
}

export function toDeployedAppConfig(deployment: DeployedAppRecord) {
  const { uxPlan } = compileGenerativeUx(deployment.manifest, deployment.apiBindings)
  return {
    id: deployment.id,
    title: deployment.title,
    description: deployment.description ?? '',
    authType: deployment.authType ?? 'public',
    requireArenaEmailId: deployment.requireArenaEmailId,
    entryPath: deployment.manifest.entryPath,
    pages: pageSummariesFromManifest(deployment.manifest),
    streamingActionIds: streamingActionIdsFrom(deployment.manifest, deployment.apiBindings),
    actionNavigate: actionNavigateFrom(deployment.manifest),
    pageOnLoad: pageOnLoadFrom(deployment.manifest),
    actionHostKeys: actionHostKeysFrom(deployment.manifest, deployment.apiBindings),
    actionHiddenInputs: actionHiddenInputsFrom(deployment.manifest, deployment.apiBindings),
    actionChatProtocol: actionChatProtocolFrom(deployment.manifest, deployment.apiBindings),
    theme: parseArenaGenerativeTheme(deployment.manifest.theme),
    uxPlan,
  }
}

export function setAppAuthCookie(
  response: NextResponse,
  deploymentId: string,
  authType: string,
  encryptedPassword?: string | null
): void {
  setDeploymentAuthCookie(response, 'app', deploymentId, authType, encryptedPassword)
}

/**
 * Loads an active deployed generative app by public identifier.
 */
export async function findDeployedAppByIdentifier(
  identifier: string
): Promise<DeployedAppRecord | null> {
  const [row] = await db
    .select()
    .from(deployedApp)
    .where(and(eq(deployedApp.identifier, identifier), isNull(deployedApp.archivedAt)))
    .limit(1)

  if (!row) return null

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    workflowId: row.workflowId,
    userId: row.userId,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    department: row.department,
    isActive: row.isActive,
    authType: row.authType,
    password: row.password,
    allowedEmails: row.allowedEmails,
    requireArenaEmailId: row.requireArenaEmailId,
    draftId: row.draftId,
    revisionId: row.revisionId,
    manifest: row.manifest as ArenaGenerativeAppManifest,
    apiBindings: (Array.isArray(row.apiBindings)
      ? row.apiBindings
      : []) as ArenaGenerativeApiBinding[],
    httpAllowlist: (Array.isArray(row.httpAllowlist) ? row.httpAllowlist : []) as string[],
  }
}

export async function validateAppDeploymentAuth(
  requestId: string,
  deployment: DeployedAppRecord,
  request: NextRequest,
  parsedBody?: { password?: string; email?: string } | null
): Promise<DeploymentAuthResult> {
  return validateDeploymentAuth(requestId, deployment, request, parsedBody, 'app')
}

export function emailIdDeniedResponse() {
  return createErrorResponse(ARENA_ACCESS_DENIED_MESSAGE, 403)
}

/**
 * Enforces Arena emailId for public embed-only apps, then chat-style
 * deployment auth. Password/email/SSO apps still get their login when
 * `emailId` is missing so a direct visit can complete the allowlist.
 *
 * Returns the resolved `arenaEmailId` so a CTA can be personalized. It is resolved
 * even when the gate is off, and it is **not verified** — see
 * `ARENA_GENERATIVE_ACTOR_EMAIL_KEY`.
 */
export async function authorizeDeployedAppRequest(options: {
  request: NextRequest
  deployment: DeployedAppRecord
  bodyEmailId?: string
  parsedBody?: { password?: string; email?: string } | null
}): Promise<
  { ok: true; requestId: string; arenaEmailId: string } | { ok: false; response: NextResponse }
> {
  const requestId = generateRequestId()
  const { request, deployment, bodyEmailId, parsedBody } = options

  if (!deployment.isActive) {
    return { ok: false, response: createErrorResponse('This app is currently unavailable', 403) }
  }

  const arenaEmailId = resolveArenaEmailIdFromRequest(request, bodyEmailId)
  if (
    shouldDenyMissingArenaEmailId({
      requireArenaEmailId: deployment.requireArenaEmailId,
      emailId: arenaEmailId,
      authType: deployment.authType,
    })
  ) {
    return { ok: false, response: emailIdDeniedResponse() }
  }

  const authResult = await validateAppDeploymentAuth(requestId, deployment, request, parsedBody)
  if (!authResult.authorized) {
    const response = createErrorResponse(
      authResult.error || 'Authentication required',
      authResult.status || 401
    )
    if (authResult.status === 429 && authResult.retryAfterMs !== undefined) {
      response.headers.set('Retry-After', String(Math.ceil(authResult.retryAfterMs / 1000)))
    }
    return { ok: false, response }
  }

  return { ok: true, requestId, arenaEmailId }
}
