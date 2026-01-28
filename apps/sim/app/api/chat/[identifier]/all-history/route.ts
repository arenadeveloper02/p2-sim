import { db } from '@sim/db'
import { chat, deployedChat } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, desc, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateRequestId } from '@/lib/core/utils/request'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'
import { addCorsHeaders } from '../../utils'

const logger = createLogger('ChatAllHistoryAPI')

// This endpoint returns all deployed chat history for a identifier
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  const { identifier } = await params
  const requestId = generateRequestId()

  try {
    logger.debug(`[${requestId}] Fetching all deployed chat history for identifier: ${identifier}`)

    // Find the chat deployment for this identifier
    const deploymentResult = await db
      .select({
        id: chat.id,
        workflowId: chat.workflowId,
        userId: chat.userId,
        isActive: chat.isActive,
        authType: chat.authType,
        password: chat.password,
        allowedEmails: chat.allowedEmails,
      })
      .from(chat)
      .where(eq(chat.identifier, identifier))
      .limit(1)

    if (deploymentResult.length === 0) {
      logger.warn(`[${requestId}] Chat not found for identifier: ${identifier}`)
      return addCorsHeaders(createErrorResponse('Chat not found', 404), request)
    }

    const deployment = deploymentResult[0]
    logger.debug(`[${requestId}] Found deployment:`, {
      id: deployment.id,
      workflowId: deployment.workflowId,
      userId: deployment.userId,
      isActive: deployment.isActive,
      authType: deployment.authType,
    })

    // Check if the chat is active
    if (!deployment.isActive) {
      logger.warn(`[${requestId}] Chat is not active: ${identifier}`)
      return addCorsHeaders(createErrorResponse('This chat is currently unavailable', 403), request)
    }

    // Validate authentication
    // const authResult = await validateChatAuth(requestId, deployment, request)
    // if (!authResult.authorized) {
    //   return addCorsHeaders(
    //     createErrorResponse(authResult.error || 'Authentication required', 401),
    //     request
    //   )
    // }

    // Require authenticated user and use their id to filter records
    const session = await getSession()
    const executingUserId = session?.user?.id
    if (!executingUserId) {
      logger.info(`[${requestId}] Unauthorized request for all-history: missing session user`)
      return addCorsHeaders(createErrorResponse('Authentication required', 401), request)
    }

    // Fetch all deployed chat records for this workflow (identifier) and executing user
    const deployedChatRecords = await db
      .select({
        chatId: deployedChat.chatId,
        title: deployedChat.title,
        workflowId: deployedChat.workflowId,
        createdAt: deployedChat.createdAt,
        updatedAt: deployedChat.updatedAt,
      })
      .from(deployedChat)
      .where(
        and(
          eq(deployedChat.workflowId, identifier),
          eq(deployedChat.executingUserId, executingUserId)
        )
      )
      .orderBy(desc(deployedChat.updatedAt))

    logger.debug(`[${requestId}] Found ${deployedChatRecords.length} deployed chat records`)

    return addCorsHeaders(
      createSuccessResponse({
        records: deployedChatRecords,
        total: deployedChatRecords.length,
      }),
      request
    )
  } catch (error: any) {
    logger.error(`[${requestId}] Error fetching deployed chat history:`, error)
    return addCorsHeaders(
      createErrorResponse(error.message || 'Failed to fetch deployed chat history', 500),
      request
    )
  }
}
