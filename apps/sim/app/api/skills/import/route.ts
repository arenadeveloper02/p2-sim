import { AuditAction, AuditResourceType, recordAudit } from '@sim/audit'
import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { captureServerEvent } from '@/lib/posthog/server'
import { importGitHubSkillPack } from '@/lib/workflows/skills/importers/github'
import { createSkillPack } from '@/lib/workflows/skills/operations'
import { getUserEntityPermissions } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('SkillsImportAPI')

const ImportSchema = z.object({
  url: z.string().url('A valid URL is required'),
  workspaceId: z.string().optional(),
})

/**
 * POST - Preview or persist a GitHub skill import.
 */
export const POST = withRouteHandler(async (req: NextRequest) => {
  const requestId = generateRequestId()

  try {
    const authResult = await checkSessionOrInternalAuth(req, { requireWorkflowId: false })
    if (!authResult.success || !authResult.userId) {
      logger.warn(`[${requestId}] Unauthorized skill import attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { url, workspaceId } = ImportSchema.parse(body)

    const preview = await importGitHubSkillPack(url)

    if (!workspaceId) {
      return NextResponse.json({ content: preview.content, preview })
    }

    const userPermission = await getUserEntityPermissions(
      authResult.userId,
      'workspace',
      workspaceId
    )
    if (!userPermission || (userPermission !== 'admin' && userPermission !== 'write')) {
      logger.warn(
        `[${requestId}] User ${authResult.userId} does not have write permission for workspace ${workspaceId}`
      )
      return NextResponse.json({ error: 'Write permission required' }, { status: 403 })
    }

    const created = await createSkillPack({
      pack: preview,
      workspaceId,
      userId: authResult.userId,
      requestId,
    })

    recordAudit({
      workspaceId,
      actorId: authResult.userId,
      actorName: authResult.userName ?? undefined,
      actorEmail: authResult.userEmail ?? undefined,
      action: AuditAction.SKILL_CREATED,
      resourceType: AuditResourceType.SKILL,
      resourceId: created.id,
      resourceName: created.name,
      description: `Imported skill pack "${created.name}"`,
      metadata: { source: 'github', sourceUrl: url, rootPath: preview.rootPath },
    })

    captureServerEvent(
      authResult.userId,
      'skill_created',
      {
        skill_id: created.id,
        skill_name: created.name,
        workspace_id: workspaceId,
        source: 'github',
        skill_count: preview.skillCount,
        file_count: preview.fileCount,
      },
      { groups: { workspace: workspaceId } }
    )

    return NextResponse.json({ success: true, data: created, preview })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 })
    }

    if (error instanceof Error && error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }

    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      logger.warn(`[${requestId}] GitHub fetch timed out`)
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
    }

    logger.error(`[${requestId}] Error importing skill`, error)
    return NextResponse.json({ error: 'Failed to import skill' }, { status: 500 })
  }
})
