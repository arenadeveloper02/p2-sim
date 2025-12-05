import { db } from '@sim/db'
import { chat, chatPromptFeedback, user, workflow, workflowExecutionLogs } from '@sim/db/schema'
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('ChatFeedbackByWorkflowAPI')

/**
 * Extract user prompt and response from executionData
 */
function extractChatData(executionData: any): {
  userPrompt: string | null
  response: string | null
} {
  let userPrompt = null
  let response = null

  if (executionData?.traceSpans && Array.isArray(executionData.traceSpans)) {
    // Look for workflow execution span
    const workflowSpan = executionData.traceSpans.find((span: any) => span.type === 'workflow')
    if (workflowSpan?.children && Array.isArray(workflowSpan.children)) {
      // Look for agent spans in children
      const agentSpans = workflowSpan.children.filter((child: any) => child.type === 'agent')
      if (agentSpans.length > 0) {
        const agentSpan = agentSpans[0] // Get first agent span
        const rawUserPrompt = agentSpan.input?.userPrompt || null

        // Strip "user input: " prefix if present
        if (rawUserPrompt && typeof rawUserPrompt === 'string') {
          userPrompt = rawUserPrompt.replace(/^user input:\s*/i, '').trim()
        } else {
          userPrompt = rawUserPrompt
        }

        response = agentSpan.output?.content || null
      }
    }
  }

  return { userPrompt, response }
}

/**
 * GET /api/chat/feedback/workflow/[id]
 * Fetch all chat feedback records for a given workflowId
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: workflowId } = await params
    if (!workflowId) {
      return createErrorResponse('workflowId is required', 400)
    }

    // Pagination params
    const { searchParams } = new URL(request.url)
    const pageSizeParam = Number(searchParams.get('pageSize'))
    const pageParam = Number(searchParams.get('page'))
    const pageSize = Number.isFinite(pageSizeParam) ? Math.min(Math.max(pageSizeParam, 1), 100) : 20
    const pageNumber = Number.isFinite(pageParam) ? Math.max(pageParam, 1) : 1
    const offset = (pageNumber - 1) * pageSize

    // Fetch author email from chat table (same approach as agents route)
    let authorEmail: string | null = null

    // Get chat record for the workflow
    const chatRecord = await db
      .select({
        userId: chat.userId,
      })
      .from(chat)
      .where(eq(chat.workflowId, workflowId))
      .limit(1)

    if (chatRecord.length > 0 && chatRecord[0].userId) {
      // Get email from user table using chat.userId
      const author = await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, chatRecord[0].userId))
        .limit(1)

      if (author.length > 0) {
        authorEmail = author[0].email
      }
    }

    // Get total count of feedback records for pagination (only where liked is false)
    const totalCountResult = await db
      .select({ count: count() })
      .from(chatPromptFeedback)
      .where(
        and(eq(chatPromptFeedback.workflowId, workflowId), eq(chatPromptFeedback.liked, false))
      )

    const totalCount = totalCountResult[0]?.count || 0
    const totalPages = Math.ceil(totalCount / pageSize)

    // Fetch all feedback for the workflow, ordered by creation date descending, with user email and workflow name
    const feedbackRecords = await db
      .select({
        id: chatPromptFeedback.id,
        userId: chatPromptFeedback.userId,
        userEmail: user.email,
        agentName: workflow.name,
        createdAt: chatPromptFeedback.createdAt,
        comment: chatPromptFeedback.comment,
        inComplete: chatPromptFeedback.inComplete,
        inAccurate: chatPromptFeedback.inAccurate,
        outOfDate: chatPromptFeedback.outOfDate,
        tooLong: chatPromptFeedback.tooLong,
        tooShort: chatPromptFeedback.tooShort,
        executionId: chatPromptFeedback.executionId,
        workflowId: chatPromptFeedback.workflowId,
      })
      .from(chatPromptFeedback)
      .leftJoin(user, eq(user.id, chatPromptFeedback.userId))
      .leftJoin(workflow, eq(workflow.id, chatPromptFeedback.workflowId))
      .where(
        and(eq(chatPromptFeedback.workflowId, workflowId), eq(chatPromptFeedback.liked, false))
      )
      .orderBy(desc(chatPromptFeedback.createdAt))
      .limit(pageSize)
      .offset(offset)

    // Fetch execution logs for all executionIds
    const executionIds = feedbackRecords.map((f) => f.executionId).filter(Boolean)
    const executionLogsMap = new Map()

    if (executionIds.length > 0) {
      const logs = await db
        .select({
          executionId: workflowExecutionLogs.executionId,
          executionData: workflowExecutionLogs.executionData,
        })
        .from(workflowExecutionLogs)
        .where(inArray(workflowExecutionLogs.executionId, executionIds))

      logs.forEach((log) => {
        executionLogsMap.set(log.executionId, log.executionData)
      })
    }

    // Build enriched feedback response
    const feedback = feedbackRecords.map((record) => {
      const executionData = executionLogsMap.get(record.executionId)
      const { userPrompt, response } = extractChatData(executionData)

      return {
        id: record.id,
        comment: record.comment || null,
        response: response || null,
        userId: record.userId,
        userEmail: record.userEmail,
        authorEmail,
        agentName: record.agentName,
        createdAt: record.createdAt,
        inComplete: record.inComplete || false,
        inAccurate: record.inAccurate || false,
        outOfDate: record.outOfDate || false,
        tooLong: record.tooLong || false,
        tooShort: record.tooShort || false,
        userPrompt: userPrompt || null,
        executionId: record.executionId,
        workflowId: record.workflowId,
      }
    })

    return createSuccessResponse({
      feedback,
      pagination: {
        count: feedback.length,
        pageSize,
        pageNumber,
        totalCount,
        totalPages,
      },
    })
  } catch (error: any) {
    logger.error('Error fetching chat feedback by workflowId:', error)
    return createErrorResponse(error.message || 'Failed to fetch feedback', 500)
  }
}
