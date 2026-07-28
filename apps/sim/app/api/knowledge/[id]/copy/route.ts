import { AuditAction, AuditResourceType, recordAudit } from '@sim/audit'
import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { copyKnowledgeBaseContract } from '@/lib/api/contracts/knowledge'
import { parseRequest } from '@/lib/api/server'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  copyKnowledgeBaseToWorkspace,
  KnowledgeBaseCopyError,
} from '@/lib/knowledge/copy'
import {
  KnowledgeBaseConflictError,
  KnowledgeBasePermissionError,
} from '@/lib/knowledge/service'
import { checkKnowledgeBaseWriteAccess } from '@/app/api/knowledge/utils'

const logger = createLogger('KnowledgeBaseCopyAPI')

export const POST = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const requestId = generateRequestId()
    const { id } = await context.params

    try {
      const auth = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })
      if (!auth.success || !auth.userId) {
        logger.warn(`[${requestId}] Unauthorized knowledge base copy attempt`)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const userId = auth.userId

      const accessCheck = await checkKnowledgeBaseWriteAccess(id, userId)
      if (!accessCheck.hasAccess) {
        if ('notFound' in accessCheck && accessCheck.notFound) {
          logger.warn(`[${requestId}] Knowledge base not found: ${id}`)
          return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
        }
        logger.warn(
          `[${requestId}] User ${userId} attempted to copy unauthorized knowledge base ${id}`
        )
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const parsed = await parseRequest(copyKnowledgeBaseContract, request, context)
      if (!parsed.success) return parsed.response

      const { targetWorkspaceId, name } = parsed.data.body

      const copied = await copyKnowledgeBaseToWorkspace({
        sourceKnowledgeBaseId: id,
        targetWorkspaceId,
        name,
        userId,
        requestId,
      })

      recordAudit({
        workspaceId: targetWorkspaceId,
        actorId: userId,
        actorName: auth.userName,
        actorEmail: auth.userEmail,
        action: AuditAction.KNOWLEDGE_BASE_CREATED,
        resourceType: AuditResourceType.KNOWLEDGE_BASE,
        resourceId: copied.id,
        resourceName: copied.name,
        description: `Copied knowledge base "${copied.name}" from workspace`,
        metadata: {
          sourceKnowledgeBaseId: id,
          sourceWorkspaceId: accessCheck.knowledgeBase.workspaceId ?? null,
          targetWorkspaceId,
        },
        request,
      })

      return NextResponse.json({
        success: true,
        data: copied,
      })
    } catch (error) {
      if (error instanceof KnowledgeBaseConflictError) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      if (error instanceof KnowledgeBasePermissionError) {
        return NextResponse.json({ error: error.message }, { status: 403 })
      }
      if (error instanceof KnowledgeBaseCopyError) {
        const status = error.message === 'Knowledge base not found' ? 404 : 400
        return NextResponse.json({ error: error.message }, { status })
      }

      logger.error(`[${requestId}] Error copying knowledge base`, error)
      return NextResponse.json({ error: 'Failed to copy knowledge base' }, { status: 500 })
    }
  }
)
