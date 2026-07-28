import { db } from '@sim/db'
import { member } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { isOrgAdminRole } from '@sim/platform-authz/workspace'
import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import {
  listOrganizationOAuthAppsContract,
  upsertOrganizationOAuthAppContract,
} from '@/lib/api/contracts/organization-oauth-apps'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { listCustomOAuthAppKeys } from '@/lib/oauth/custom-app-config'
import {
  listOrganizationOAuthApps,
  upsertOrganizationOAuthApp,
  validateOrgWorkspaceAllowlist,
} from '@/lib/oauth/custom-apps'
import {
  isZoomAdminEnabledForOrganization,
  listCustomOAuthAppKeysForOrganization,
} from '@/lib/workspaces/zoom-admin-org'

const logger = createLogger('OrganizationOAuthAppsAPI')

async function requireOrgAdmin(organizationId: string, userId: string) {
  const [memberEntry] = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1)

  if (!memberEntry) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  if (!isOrgAdminRole(memberEntry.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 }),
    }
  }

  return { ok: true as const }
}

function toSummary(row: {
  id: string
  appKey: string
  clientId: string
  allowedWorkspaceIds: string[]
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: row.id,
    appKey: row.appKey,
    clientId: row.clientId,
    hasClientSecret: true,
    allowedWorkspaceIds: row.allowedWorkspaceIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * GET /api/organizations/[id]/oauth-apps
 * Lists organization-scoped custom OAuth apps (org admin/owner only).
 */
export const GET = withRouteHandler(
  async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = await parseRequest(listOrganizationOAuthAppsContract, _request, context)
    if (!parsed.success) return parsed.response

    const { id: organizationId } = parsed.data.params
    const authz = await requireOrgAdmin(organizationId, session.user.id)
    if (!authz.ok) return authz.response

    const appKeys = listCustomOAuthAppKeysForOrganization(organizationId)
    const rows = await listOrganizationOAuthApps(organizationId)
    const configuredKeys = new Set(
      rows.filter((row) => appKeys.includes(row.appKey)).map((row) => row.appKey)
    )
    const apps = [
      ...rows.filter((row) => appKeys.includes(row.appKey)).map((row) => toSummary(row)),
      ...appKeys
        .filter((appKey) => !configuredKeys.has(appKey))
        .map((appKey) => ({
          id: '',
          appKey,
          clientId: '',
          hasClientSecret: false,
          allowedWorkspaceIds: [] as string[],
          createdAt: '',
          updatedAt: '',
        })),
    ]

    return NextResponse.json({ apps })
  }
)

/**
 * POST /api/organizations/[id]/oauth-apps
 * Upserts an organization-scoped custom OAuth app (org admin/owner only).
 */
export const POST = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = await parseRequest(upsertOrganizationOAuthAppContract, request, context)
    if (!parsed.success) return parsed.response

    const { id: organizationId } = parsed.data.params
    const { appKey, clientId, clientSecret, allowedWorkspaceIds } = parsed.data.body

    const authz = await requireOrgAdmin(organizationId, session.user.id)
    if (!authz.ok) return authz.response

    if (!listCustomOAuthAppKeys().includes(appKey)) {
      return NextResponse.json(
        { error: `Unsupported custom OAuth app: ${appKey}` },
        { status: 400 }
      )
    }

    if (appKey === 'zoom-admin' && !isZoomAdminEnabledForOrganization(organizationId)) {
      return NextResponse.json(
        { error: 'Zoom Admin is not available for this organization' },
        { status: 403 }
      )
    }

    let resolvedAllowlist: string[] = []
    if (appKey === 'zoom-admin') {
      const validation = await validateOrgWorkspaceAllowlist(
        organizationId,
        allowedWorkspaceIds ?? []
      )
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }
      resolvedAllowlist = validation.workspaceIds
    }

    await upsertOrganizationOAuthApp({
      organizationId,
      appKey,
      clientId,
      clientSecret,
      userId: session.user.id,
      allowedWorkspaceIds: resolvedAllowlist,
    })

    const rows = await listOrganizationOAuthApps(organizationId)
    const saved = rows.find((row) => row.appKey === appKey)
    if (!saved) {
      logger.error('Upserted organization OAuth app but row not found on read-back', {
        organizationId,
        appKey,
      })
      return NextResponse.json({ error: 'Failed to save OAuth app' }, { status: 500 })
    }

    logger.info('Organization custom OAuth app saved', { organizationId, appKey })

    return NextResponse.json({
      success: true as const,
      app: toSummary(saved),
    })
  }
)
