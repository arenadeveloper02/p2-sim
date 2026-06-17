import { db } from '@sim/db'
import { chatPromptFeedback, workflowDeploymentVersion, workflowExecutionLogs } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { getDeployedChatHistoryContract } from '@/lib/api/contracts/chats'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { toHistoryDeploymentVersionMeta } from '@/lib/chat/deployed-chat-memory'
import {
  getPersistedGeneratedImages,
  getPersistedHistoryAttachments,
} from '@/lib/chat/history-persistence'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { getWorkspaceIdsForUser } from '@/lib/workspaces/permissions/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'
import { addCorsHeaders } from '../../utils'

const logger = createLogger('ChatHistoryAPI')

function extractConversationIdFromExecutionData(executionData: unknown): string | null {
  if (!executionData || typeof executionData !== 'object') {
    return null
  }

  const traceSpans = (executionData as { traceSpans?: unknown }).traceSpans
  if (!traceSpans) {
    return null
  }

  const spansArray = Array.isArray(traceSpans)
    ? traceSpans
    : typeof traceSpans === 'object' &&
        traceSpans !== null &&
        Array.isArray((traceSpans as { spans?: unknown }).spans)
      ? (traceSpans as { spans: unknown[] }).spans
      : null

  if (!spansArray) {
    return null
  }

  const workflowSpan = spansArray.find(
    (span) => typeof span === 'object' && span !== null && (span as { type?: string }).type === 'workflow'
  ) as { children?: Array<{ type?: string; input?: { conversationId?: string } }> } | undefined

  const agentSpan = workflowSpan?.children?.find((child) => child.type === 'agent')
  const conversationId = agentSpan?.input?.conversationId
  return typeof conversationId === 'string' ? conversationId : null
}

/**
 * GET /api/chat/[identifier]/history
 *
 * Retrieves the execution history for external chat interactions.
 * Only returns logs where is_external_chat = true in workflow_execution_logs table.
 */
export const GET = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ identifier: string }> }) => {
    const { identifier } = await context.params

    const parsed = await parseRequest(getDeployedChatHistoryContract, request, context, {
      validationErrorResponse: (err) => {
        const message = err.issues.map((issue) => issue.message).join(', ')
        return addCorsHeaders(createErrorResponse(message, 400), request)
      },
    })
    if (!parsed.success) {
      return parsed.response
    }

    const { query } = parsed.data
    const limit = query.limit ?? 50
    const offset = query.offset ?? 0
    const { startDate, endDate, chatId, level } = query

    if (startDate && Number.isNaN(Date.parse(startDate))) {
      return addCorsHeaders(
        createErrorResponse('Invalid startDate format. Use ISO 8601 format.', 400),
        request
      )
    }
    if (endDate && Number.isNaN(Date.parse(endDate))) {
      return addCorsHeaders(
        createErrorResponse('Invalid endDate format. Use ISO 8601 format.', 400),
        request
      )
    }

    const session = await getSession()
    const executingUserId = session?.user?.id
    if (!executingUserId) {
      logger.info('Unauthorized request for history: missing session user')
      return addCorsHeaders(createErrorResponse('Authentication required', 401), request)
    }

    let conditions = and(
      eq(workflowExecutionLogs.workflowId, identifier),
      eq(workflowExecutionLogs.isExternalChat, true),
      eq(workflowExecutionLogs.userId, executingUserId)
    )

    if (startDate) {
      conditions = and(conditions, gte(workflowExecutionLogs.startedAt, new Date(startDate)))
    }
    if (endDate) {
      conditions = and(conditions, lte(workflowExecutionLogs.startedAt, new Date(endDate)))
    }
    if (level) {
      conditions = and(conditions, eq(workflowExecutionLogs.level, level))
    }
    if (chatId) {
      conditions = and(conditions, eq(workflowExecutionLogs.chatId, chatId))
    }

    try {
      const logs = await db
        .select({
          id: workflowExecutionLogs.id,
          executionId: workflowExecutionLogs.executionId,
          level: workflowExecutionLogs.level,
          trigger: workflowExecutionLogs.trigger,
          startedAt: workflowExecutionLogs.startedAt,
          endedAt: workflowExecutionLogs.endedAt,
          totalDurationMs: workflowExecutionLogs.totalDurationMs,
          executionData: workflowExecutionLogs.executionData,
          initialInput: workflowExecutionLogs.initialInput,
          finalChatOutput: workflowExecutionLogs.finalChatOutput,
          createdAt: workflowExecutionLogs.createdAt,
          deploymentVersionId: workflowExecutionLogs.deploymentVersionId,
          version: workflowDeploymentVersion.version,
          versionName: workflowDeploymentVersion.name,
          versionCreatedAt: workflowDeploymentVersion.createdAt,
        })
        .from(workflowExecutionLogs)
        .leftJoin(
          workflowDeploymentVersion,
          eq(workflowExecutionLogs.deploymentVersionId, workflowDeploymentVersion.id)
        )
        .where(conditions)
        .orderBy(workflowExecutionLogs.startedAt)
        .limit(limit)
        .offset(offset)

      let userWorkspaceIds: string[] = []
      try {
        userWorkspaceIds = await getWorkspaceIdsForUser(executingUserId)
      } catch {
        // Non-fatal; user will get no knowledge refs in history
      }

      const executionIds = logs.map((log) => log.executionId)
      let likedByExecutionId = new Map<string, boolean>()
      if (executionIds.length > 0) {
        const feedbackRows = await db
          .select({
            executionId: chatPromptFeedback.executionId,
            liked: sql<boolean>`bool_or(${chatPromptFeedback.liked})`,
          })
          .from(chatPromptFeedback)
          .where(inArray(chatPromptFeedback.executionId, executionIds))
          .groupBy(chatPromptFeedback.executionId)

        likedByExecutionId = new Map(feedbackRows.map((row) => [row.executionId, !!row.liked]))
      }

      const totalCountResult = await db
        .select({ count: sql`count(*)` })
        .from(workflowExecutionLogs)
        .where(conditions)

      const totalCount = totalCountResult[0]?.count || 0

      const formattedLogs = logs.map((log) => {
        const executionData = log.executionData
        const userInput = log.initialInput || null
        const modelOutput = log.finalChatOutput || null
        const conversationId = extractConversationIdFromExecutionData(executionData)
        const rawKnowledgeRefs = Array.isArray(
          (executionData as { knowledgeRefs?: unknown })?.knowledgeRefs
        )
          ? (executionData as { knowledgeRefs: unknown[] }).knowledgeRefs
          : null
        const attachments = getPersistedHistoryAttachments(executionData)
        const generatedImages = getPersistedGeneratedImages(executionData)
        const knowledgeRefs =
          rawKnowledgeRefs == null
            ? null
            : userWorkspaceIds.length === 0
              ? null
              : rawKnowledgeRefs.filter(
                  (ref) =>
                    typeof ref === 'object' &&
                    ref !== null &&
                    'workspaceId' in ref &&
                    typeof (ref as { workspaceId?: string | null }).workspaceId === 'string' &&
                    userWorkspaceIds.includes((ref as { workspaceId: string }).workspaceId)
                )

        return {
          id: log.id,
          executionId: log.executionId,
          level: log.level,
          trigger: log.trigger,
          startedAt: log.startedAt.toISOString(),
          endedAt: log.endedAt?.toISOString() || null,
          totalDurationMs: log.totalDurationMs,
          conversationId,
          userInput,
          attachments,
          modelOutput,
          generatedImages,
          knowledgeRefs,
          liked: likedByExecutionId.has(log.executionId)
            ? likedByExecutionId.get(log.executionId)!
            : null,
          createdAt: log.createdAt.toISOString(),
          deploymentVersion: toHistoryDeploymentVersionMeta({
            deploymentVersionId: log.deploymentVersionId,
            version: log.version,
            versionName: log.versionName,
            versionCreatedAt: log.versionCreatedAt,
          }),
        }
      })

      const response = {
        logs: formattedLogs,
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore: offset + limit < Number(totalCount),
        },
      }

      logger.info(`Successfully fetched ${formattedLogs.length} chat history entries`, {
        identifier,
      })

      return addCorsHeaders(createSuccessResponse(response), request)
    } catch (error) {
      logger.error('Error fetching chat history:', error)
      return addCorsHeaders(createErrorResponse('Failed to fetch chat history', 500), request)
    }
  }
)
