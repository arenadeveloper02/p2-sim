import { and, eq, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { addCorsHeaders } from '@/app/api/chat/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'
import { db } from '@/db'
import { deployedChatHistory } from '@/db/schema'

const logger = createLogger('ChatHistoryAPI')

/**
 * GET /api/chat/[subdomain]/history
 *
 * Retrieves the chat history from deployed_chat_history table.
 *
 * Query Parameters:
 * - limit: Number of records to return (max 100, default 50)
 * - offset: Number of records to skip (default 0)
 * - chatId: Filter by specific chat ID (required)
 *
 * Authentication:
 * - Requires authenticated user session
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
    const chatId = searchParams.get('chatId')

    // Require chatId parameter
    if (!chatId) {
      return addCorsHeaders(createErrorResponse('chatId parameter is required', 400), request)
    }

    // Require authenticated user and use their id to filter records
    const session = await getSession()
    const userId = session?.user?.id
    if (!userId) {
      logger.info(`[${requestId}] Unauthorized request for history: missing session user`)
      return addCorsHeaders(createErrorResponse('Authentication required', 401), request)
    }

    logger.debug(`[${requestId}] Query parameters:`, {
      chatId,
      userId,
      limit,
      offset,
    })

    // Build query conditions for deployed_chat_history
    const conditions = and(
      eq(deployedChatHistory.chatId, chatId),
      eq(deployedChatHistory.userId, userId)
    )

    // Query deployed_chat_history table
    const logs = await db
      .select({
        id: deployedChatHistory.id,
        chatId: deployedChatHistory.chatId,
        workflowId: deployedChatHistory.workflowId,
        input: deployedChatHistory.input,
        output: deployedChatHistory.output,
        createdAt: deployedChatHistory.createdAt,
        updatedAt: deployedChatHistory.updatedAt,
      })
      .from(deployedChatHistory)
      .where(conditions)
      .orderBy(deployedChatHistory.createdAt)
      .limit(limit)
      .offset(offset)

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: sql`count(*)` })
      .from(deployedChatHistory)
      .where(conditions)

    const totalCount = totalCountResult[0]?.count || 0

    // Format the response data
    const formattedLogs = logs.map((log) => {
      return {
        id: log.id,
        chatId: log.chatId,
        workflowId: log.workflowId,
        userInput: log.input,
        modelOutput: log.output,
        createdAt: log.createdAt.toISOString(),
        updatedAt: log.updatedAt.toISOString(),
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

    logger.info(
      `[${requestId}] Successfully fetched ${formattedLogs.length} chat history entries for chatId: ${chatId}`
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
