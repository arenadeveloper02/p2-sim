import { db } from '@sim/db'
import { generativeAppDraft } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { desc, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { listGenerativeAppDraftsContract } from '@/lib/api/contracts/arena-generative-apps'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { checkWorkflowAccessForChatCreation } from '@/app/api/chat/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('GenerativeAppDraftsAPI')

export const GET = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return createErrorResponse('Unauthorized', 401)
  }

  const parsed = await parseRequest(listGenerativeAppDraftsContract, request, {})
  if (!parsed.success) return parsed.response

  const workflowId = parsed.data.query.workflowId
  if (workflowId) {
    const { hasAccess } = await checkWorkflowAccessForChatCreation(workflowId, session.user.id)
    if (!hasAccess) {
      return createErrorResponse('Workflow not found or access denied', 404)
    }
  }

  try {
    const rows = workflowId
      ? await db
          .select({
            id: generativeAppDraft.id,
            title: generativeAppDraft.title,
            entryPath: generativeAppDraft.entryPath,
            revision: generativeAppDraft.revision,
            workflowId: generativeAppDraft.workflowId,
            updatedAt: generativeAppDraft.updatedAt,
          })
          .from(generativeAppDraft)
          .where(eq(generativeAppDraft.workflowId, workflowId))
          .orderBy(desc(generativeAppDraft.updatedAt))
      : await db
          .select({
            id: generativeAppDraft.id,
            title: generativeAppDraft.title,
            entryPath: generativeAppDraft.entryPath,
            revision: generativeAppDraft.revision,
            workflowId: generativeAppDraft.workflowId,
            updatedAt: generativeAppDraft.updatedAt,
          })
          .from(generativeAppDraft)
          .where(eq(generativeAppDraft.userId, session.user.id))
          .orderBy(desc(generativeAppDraft.updatedAt))

    return createSuccessResponse({
      drafts: rows.map((row) => ({
        id: row.id,
        title: row.title,
        entryPath: row.entryPath,
        revision: row.revision,
        workflowId: row.workflowId,
        updatedAt: row.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    logger.error('Failed to list generative app drafts', { error: getErrorMessage(error) })
    return createErrorResponse(getErrorMessage(error, 'Failed to list drafts'), 500)
  }
})
