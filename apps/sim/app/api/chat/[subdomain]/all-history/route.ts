import { desc, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { addCorsHeaders, validateChatAuth } from '@/app/api/chat/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'
import { db } from '@/db'
import { chat, deployedChat } from '@/db/schema'

const logger = createLogger('ChatAllHistoryAPI')

// This endpoint returns all deployed chat history for a subdomain
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ subdomain: string }> }
) {
  const { subdomain } = await params
  const requestId = generateRequestId()

  try {
    logger.debug(`[${requestId}] Fetching all deployed chat history for subdomain: ${subdomain}`)

    // Find the chat deployment for this subdomain
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
      .where(eq(chat.subdomain, subdomain))
      .limit(1)

    if (deploymentResult.length === 0) {
      logger.warn(`[${requestId}] Chat not found for subdomain: ${subdomain}`)
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
      logger.warn(`[${requestId}] Chat is not active: ${subdomain}`)
      return addCorsHeaders(createErrorResponse('This chat is currently unavailable', 403), request)
    }

    // Validate authentication
    const authResult = await validateChatAuth(requestId, deployment, request)
    if (!authResult.authorized) {
      return addCorsHeaders(
        createErrorResponse(authResult.error || 'Authentication required', 401),
        request
      )
    }

    // Fetch all deployed chat records for this workflow (subdomain)
    const deployedChatRecords = await db
      .select({
        chatId: deployedChat.chatId,
        title: deployedChat.title,
        workflowId: deployedChat.workflowId,
        createdAt: deployedChat.createdAt,
        updatedAt: deployedChat.updatedAt,
      })
      .from(deployedChat)
      .where(eq(deployedChat.workflowId, subdomain))
      .orderBy(desc(deployedChat.createdAt))

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
