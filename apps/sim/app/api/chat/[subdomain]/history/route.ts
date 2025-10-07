import { and, eq, gte, lte, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { addCorsHeaders } from '@/app/api/chat/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'
import { db } from '@/db'
import { workflowExecutionLogs } from '@/db/schema'

const logger = createLogger('ChatHistoryAPI')

/**
 * GET /api/chat/[subdomain]/history
 *
 * Retrieves the execution history for external chat interactions.
 * Only returns logs where is_external_chat = true in workflow_execution_logs table.
 *
 * Query Parameters:
 * - limit: Number of records to return (max 100, default 50)
 * - offset: Number of records to skip (default 0)
 * - startDate: ISO 8601 date string to filter from
 * - endDate: ISO 8601 date string to filter to
 * - conversationId: Filter by specific conversation ID
 * - level: Filter by log level ('info' or 'error')
 *
 * Authentication:
 * - Public chats: No authentication required
 * - Password/Email chats: Requires valid authentication cookie or credentials
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ subdomain: string }> }
) {
  const { subdomain } = await params
  const requestId = generateRequestId()

  try {
    logger.debug(`[${requestId}] Fetching chat history for subdomain: ${subdomain}`)

    // Parse query parameters for pagination and filtering
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '50'), 100) // Max 100 items
    const offset = Math.max(Number.parseInt(searchParams.get('offset') || '0'), 0) // Ensure non-negative
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const conversationId = searchParams.get('conversationId') || subdomain
    const level = searchParams.get('level') // 'info' or 'error'

    logger.debug(
      `[${requestId}] Start date: ${startDate}, End date: ${endDate}, Conversation ID: ${conversationId}, Level: ${level}`
    )

    // Validate date parameters
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

    // Validate level parameter
    if (level && !['info', 'error'].includes(level)) {
      return addCorsHeaders(
        createErrorResponse('Invalid level parameter. Must be "info" or "error".', 400),
        request
      )
    }

    // Build query conditions for external chat logs
    let conditions = and(
      eq(workflowExecutionLogs.workflowId, subdomain),
      eq(workflowExecutionLogs.isExternalChat, true) // Only external chat logs
    )

    // Add date range filters if provided
    if (startDate) {
      conditions = and(conditions, gte(workflowExecutionLogs.startedAt, new Date(startDate)))
    }
    if (endDate) {
      conditions = and(conditions, lte(workflowExecutionLogs.startedAt, new Date(endDate)))
    }

    // Add level filter if provided
    if (level) {
      conditions = and(conditions, eq(workflowExecutionLogs.level, level))
    }

    // Add conversation ID filter if provided (search in executionData)
    // if (conversationId) {
    //   conditions = and(conditions, sql`${workflowExecutionLogs.executionData}->>'conversationId' = ${conversationId}`)
    // }

    // Log the conditions in a safe way (avoid circular references)
    const conditionsInfo = {
      workflowId: subdomain,
      isExternalChat: true,
      startDate: startDate || null,
      endDate: endDate || null,
      level: level || null,
      conversationId: conversationId || null,
    }
    logger.debug(`[${requestId}] Query conditions:`, conditionsInfo)

    // Query workflow execution logs for external chat
    const logs = await db
      .select({
        id: workflowExecutionLogs.id,
        executionId: workflowExecutionLogs.executionId,
        level: workflowExecutionLogs.level,
        trigger: workflowExecutionLogs.trigger,
        startedAt: workflowExecutionLogs.startedAt,
        endedAt: workflowExecutionLogs.endedAt,
        totalDurationMs: workflowExecutionLogs.totalDurationMs,
        cost: workflowExecutionLogs.cost,
        executionData: workflowExecutionLogs.executionData,
        createdAt: workflowExecutionLogs.createdAt,
      })
      .from(workflowExecutionLogs)
      .where(conditions)
      .orderBy(workflowExecutionLogs.startedAt)
      .limit(limit)
      .offset(offset)

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: sql`count(*)` })
      .from(workflowExecutionLogs)
      .where(conditions)

    const totalCount = totalCountResult[0]?.count || 0

    // Format the response data
    const formattedLogs = logs.map((log) => {
      const executionData = log.executionData as any

      // Extract input and output from traceSpans children
      let userInput = null
      let modelOutput = null
      let conversationId = null

      if (executionData?.traceSpans && Array.isArray(executionData.traceSpans)) {
        // Look for workflow execution span
        const workflowSpan = executionData.traceSpans.find((span: any) => span.type === 'workflow')
        if (workflowSpan?.children && Array.isArray(workflowSpan.children)) {
          // Look for agent spans in children
          const agentSpans = workflowSpan.children.filter((child: any) => child.type === 'agent')
          if (agentSpans.length > 0) {
            const agentSpan = agentSpans[0] // Get first agent span
            userInput = agentSpan.input?.userPrompt || null
            modelOutput = agentSpan.output?.content || null
            // Try to extract conversationId from input if available
            conversationId = agentSpan.input?.conversationId || null
          }
        }
      }

      return {
        id: log.id,
        executionId: log.executionId,
        level: log.level,
        trigger: log.trigger,
        startedAt: log.startedAt.toISOString(),
        endedAt: log.endedAt?.toISOString() || null,
        totalDurationMs: log.totalDurationMs,
        // Extract relevant chat information from executionData
        conversationId,
        userInput,
        modelOutput,
        createdAt: log.createdAt.toISOString(),
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
      //   filters: {
      //     startDate: startDate || null,
      //     endDate: endDate || null,
      //     conversationId: conversationId || null,
      //     level: level || null,
      //   }
      //   summary: {
      //     totalExecutions: Number(totalCount),
      //     successfulExecutions: formattedLogs.filter(log => log.level === 'info').length,
      //     failedExecutions: formattedLogs.filter(log => log.level === 'error').length,
      //     uniqueConversations: new Set(formattedLogs.map(log => log.conversationId).filter(Boolean)).size,
      //   },
    }

    logger.info(
      `[${requestId}] Successfully fetched ${formattedLogs.length} chat history entries for subdomain: ${subdomain}`
    )

    return addCorsHeaders(createSuccessResponse(response), request)
  } catch (error: any) {
    logger.error(`[${requestId}] Error fetching chat history:`, error)
    return addCorsHeaders(
      createErrorResponse(error.message || 'Failed to fetch chat history', 500),
      request
    )
  }
}
