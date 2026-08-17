import { db } from '@sim/db'
import { deployedApp } from '@sim/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import type { NextRequest, NextResponse } from 'next/server'
import {
  ARENA_ACCESS_DENIED_MESSAGE,
  resolveArenaEmailIdFromRequest,
} from '@/lib/arena-generative-ui/email-gate'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeAppManifest,
} from '@/lib/arena-generative-ui/types'
import { streamingActionIdsFrom } from '@/lib/arena-generative-ui/types'
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
  return {
    id: deployment.id,
    title: deployment.title,
    description: deployment.description ?? '',
    authType: deployment.authType ?? 'public',
    requireArenaEmailId: deployment.requireArenaEmailId,
    entryPath: deployment.manifest.entryPath,
    pages: pageSummariesFromManifest(deployment.manifest),
    streamingActionIds: streamingActionIdsFrom(deployment.manifest, deployment.apiBindings),
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
 * Enforces Arena emailId then chat-style deployment auth for a public app request.
 */
export async function authorizeDeployedAppRequest(options: {
  request: NextRequest
  deployment: DeployedAppRecord
  bodyEmailId?: string
  parsedBody?: { password?: string; email?: string } | null
}): Promise<{ ok: true; requestId: string } | { ok: false; response: NextResponse }> {
  const requestId = generateRequestId()
  const { request, deployment, bodyEmailId, parsedBody } = options

  if (!deployment.isActive) {
    return { ok: false, response: createErrorResponse('This app is currently unavailable', 403) }
  }

  if (deployment.requireArenaEmailId) {
    const emailId = resolveArenaEmailIdFromRequest(request, bodyEmailId)
    if (!emailId) {
      return { ok: false, response: emailIdDeniedResponse() }
    }
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

  return { ok: true, requestId }
}
