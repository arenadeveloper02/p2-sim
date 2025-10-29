import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { loadWorkflowFromNormalizedTables } from '@/lib/workflows/db-helpers'
import {
  addCorsHeaders,
  executeWorkflowForChat,
  setChatAuthCookie,
  validateAuthToken,
  validateChatAuth,
} from '@/app/api/chat/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'
import { db } from '@/db'
import { chat, deployedChat, workflow } from '@/db/schema'

const logger = createLogger('ChatSubdomainAPI')

// This endpoint handles chat interactions via the subdomain
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ subdomain: string }> }
) {
  const { subdomain } = await params
  const requestId = generateRequestId()

  try {
    logger.debug(`[${requestId}] Processing chat request for subdomain: ${subdomain}`)

    // Parse the request body once
    let parsedBody
    try {
      parsedBody = await request.json()
      logger.debug(`[${requestId}] Parsed request body:`, {
        chatId: parsedBody.chatId,
        input: parsedBody.input ? `${parsedBody.input.substring(0, 100)}...` : 'No input',
        conversationId: parsedBody.conversationId,
        hasWorkflowInputs: !!parsedBody.workflowInputs,
      })
    } catch (_error) {
      logger.error(`[${requestId}] Failed to parse request body:`, _error)
      return addCorsHeaders(createErrorResponse('Invalid request body', 400), request)
    }

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
        outputConfigs: chat.outputConfigs,
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

    // Validate authentication with the parsed body
    const authResult = await validateChatAuth(requestId, deployment, request, parsedBody)
    if (!authResult.authorized) {
      return addCorsHeaders(
        createErrorResponse(authResult.error || 'Authentication required', 401),
        request
      )
    }

    // Use the already parsed body
    const { input, password, email, conversationId, workflowInputs, chatId } = parsedBody
    logger.debug(`[${requestId}] Extracted request parameters:`, {
      hasInput: !!input,
      hasPassword: !!password,
      hasEmail: !!email,
      conversationId,
      hasWorkflowInputs: !!workflowInputs,
      chatId,
    })

    // If this is an authentication request (has password or email but no input),
    // set auth cookie and return success
    if ((password || email) && !input) {
      const response = addCorsHeaders(createSuccessResponse({ authenticated: true }), request)

      // Set authentication cookie
      setChatAuthCookie(response, deployment.id, deployment.authType)

      return response
    }

    // For chat messages, create regular response
    if (!input) {
      return addCorsHeaders(createErrorResponse('No input provided', 400), request)
    }

    // Store chat details in deployed_chat table if chatId is provided and not already exists
    if (chatId) {
      try {
        logger.debug(`[${requestId}] Attempting to store chat details for chatId: ${chatId}`)

        // Try to get the executing user ID from session
        let executingUserId: string | undefined
        try {
          const session = await getSession()
          executingUserId = session?.user?.id
          logger.debug(`[${requestId}] Executing user ID from session:`, executingUserId)
        } catch (error) {
          logger.debug(
            `[${requestId}] Could not get session (user may not be authenticated):`,
            error
          )
        }

        // Check if chatId already exists in deployed_chat table
        const existingChat = await db
          .select({ id: deployedChat.id })
          .from(deployedChat)
          .where(eq(deployedChat.chatId, chatId))
          .limit(1)

        logger.debug(`[${requestId}] Existing chat check result:`, existingChat)

        // If chatId doesn't exist, create a new record
        if (existingChat.length === 0) {
          // Generate title from first 4-5 words of input
          const words = input.trim().split(/\s+/)
          const title = words.slice(0, 5).join(' ')

          // Generate a unique ID for the deployed_chat record
          const deployedChatId = uuidv4()

          logger.debug(`[${requestId}] Inserting new deployed_chat record:`, {
            id: deployedChatId,
            chatId: chatId,
            title: title,
            workflowId: subdomain,
            executingUserId,
          })

          await db.insert(deployedChat).values({
            id: deployedChatId,
            chatId: chatId,
            title: title,
            workflowId: subdomain, // Using subdomain as workflow_id as per requirements
            executingUserId,
            createdAt: new Date(),
            updatedAt: new Date(),
          })

          logger.debug(
            `[${requestId}] Successfully stored new chat details in deployed_chat table: ${chatId}`
          )
        } else {
          // Update the updatedAt timestamp for existing chat
          const existingChatId = existingChat[0].id

          logger.debug(`[${requestId}] Updating updatedAt for existing chat: ${chatId}`)

          await db
            .update(deployedChat)
            .set({
              updatedAt: new Date(),
              executingUserId: executingUserId || null, // Update executing user ID if available
            })
            .where(eq(deployedChat.id, existingChatId))

          logger.debug(`[${requestId}] Successfully updated updatedAt for existing chat: ${chatId}`)
        }
      } catch (error: any) {
        // Log error but don't fail the request
        logger.error(`[${requestId}] Error storing chat details in deployed_chat table:`, error)
        logger.error(`[${requestId}] Error details:`, {
          message: error.message,
          stack: error.stack,
          code: error.code,
        })
      }
    } else {
      logger.debug(`[${requestId}] No chatId provided in request body`)
    }

    // Get the workflow for this chat
    const workflowResult = await db
      .select({
        isDeployed: workflow.isDeployed,
      })
      .from(workflow)
      .where(eq(workflow.id, deployment.workflowId))
      .limit(1)

    if (workflowResult.length === 0 || !workflowResult[0].isDeployed) {
      logger.warn(`[${requestId}] Workflow not found or not deployed: ${deployment.workflowId}`)
      return addCorsHeaders(createErrorResponse('Chat workflow is not available', 503), request)
    }

    try {
      // Execute workflow with structured input (input + conversationId for context)
      logger.debug(`[${requestId}] Executing workflow for chat:`, {
        deploymentId: deployment.id,
        workflowId: deployment.workflowId,
        hasInput: !!input,
        conversationId,
        hasWorkflowInputs: !!workflowInputs,
        chatId,
      })

      const result = await executeWorkflowForChat(
        deployment.id,
        input,
        conversationId,
        workflowInputs,
        chatId // Pass the chatId from payload for logging
      )

      // The result is always a ReadableStream that we can pipe to the client
      const streamResponse = new NextResponse(result, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      })
      return addCorsHeaders(streamResponse, request)
    } catch (error: any) {
      logger.error(`[${requestId}] Error processing chat request:`, error)
      return addCorsHeaders(
        createErrorResponse(error.message || 'Failed to process request', 500),
        request
      )
    }
  } catch (error: any) {
    logger.error(`[${requestId}] Error processing chat request:`, error)
    return addCorsHeaders(
      createErrorResponse(error.message || 'Failed to process request', 500),
      request
    )
  }
}

// This endpoint returns information about the chat
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ subdomain: string }> }
) {
  const { subdomain } = await params
  const requestId = generateRequestId()

  try {
    logger.debug(`[${requestId}] Fetching chat info for subdomain: ${subdomain}`)

    // Find the chat deployment for this subdomain
    const deploymentResult = await db
      .select({
        id: chat.id,
        title: chat.title,
        description: chat.description,
        customizations: chat.customizations,
        isActive: chat.isActive,
        workflowId: chat.workflowId,
        authType: chat.authType,
        password: chat.password,
        allowedEmails: chat.allowedEmails,
        outputConfigs: chat.outputConfigs,
      })
      .from(chat)
      .where(eq(chat.subdomain, subdomain))
      .limit(1)

    if (deploymentResult.length === 0) {
      logger.warn(`[${requestId}] Chat not found for subdomain: ${subdomain}`)
      return addCorsHeaders(createErrorResponse('Chat not found', 404), request)
    }

    const deployment = deploymentResult[0]

    // Check if the chat is active
    if (!deployment.isActive) {
      logger.warn(`[${requestId}] Chat is not active: ${subdomain}`)
      return addCorsHeaders(createErrorResponse('This chat is currently unavailable', 403), request)
    }

    // Extract input fields from the workflow's starter block
    // This allows all authorized users to see input form without needing workflow permissions
    let inputFields: any[] = []
    try {
      const workflowData = await loadWorkflowFromNormalizedTables(deployment.workflowId)
      if (workflowData?.blocks) {
        for (const blockId in workflowData.blocks) {
          const block = workflowData.blocks[blockId]
          if (block.type === 'starter') {
            const inputFormat = block.subBlocks?.inputFormat?.value
            if (Array.isArray(inputFormat) && inputFormat.length > 0) {
              inputFields = inputFormat
              logger.debug(
                `[${requestId}] Found ${inputFields.length} input fields in starter block`
              )
              break
            }
          }
        }
      }
    } catch (error) {
      logger.warn(
        `[${requestId}] Failed to extract input fields from workflow, continuing without them:`,
        error
      )
      // Non-fatal: continue without input fields
    }

    // Check for auth cookie first
    const cookieName = `chat_auth_${deployment.id}`
    const authCookie = request.cookies.get(cookieName)

    if (
      deployment.authType !== 'public' &&
      authCookie &&
      validateAuthToken(authCookie.value, deployment.id)
    ) {
      // Cookie valid, return chat info
      return addCorsHeaders(
        createSuccessResponse({
          id: deployment.id,
          title: deployment.title,
          description: deployment.description,
          customizations: deployment.customizations,
          authType: deployment.authType,
          outputConfigs: deployment.outputConfigs,
          inputFields, // Include input fields so all users can see the form
        }),
        request
      )
    }

    // If no valid cookie, check if user is logged in and has email access
    if (deployment.authType === 'email') {
      try {
        const session = await getSession()
        logger.debug(`[${requestId}] Session check:`, {
          hasSession: !!session,
          hasUser: !!session?.user,
          userEmail: session?.user?.email,
        })

        const userEmail = session?.user?.email

        if (userEmail) {
          logger.debug(`[${requestId}] User is logged in with email: ${userEmail}`)
          const allowedEmails = Array.isArray(deployment.allowedEmails)
            ? (deployment.allowedEmails as string[])
            : []

          logger.debug(`[${requestId}] Allowed emails for this chat:`, allowedEmails)

          // Normalize email for comparison (lowercase and trim to handle case differences and whitespace)
          const normalizedUserEmail = userEmail.toLowerCase().trim()

          // Check if email is explicitly allowed or domain is allowed
          const isEmailAllowed = allowedEmails.some((allowed: string) => {
            const normalizedAllowed = allowed.toLowerCase().trim()
            const exactMatch = normalizedAllowed === normalizedUserEmail
            const domainMatch =
              normalizedAllowed.startsWith('@') && normalizedUserEmail.endsWith(normalizedAllowed)

            if (exactMatch || domainMatch) {
              logger.debug(`[${requestId}] Email match found:`, {
                userEmail: normalizedUserEmail,
                allowedEmail: normalizedAllowed,
                matchType: exactMatch ? 'exact' : 'domain',
              })
            }

            return exactMatch || domainMatch
          })

          if (isEmailAllowed) {
            logger.debug(
              `[${requestId}] User email is in allowed list, automatically granting access without modal`
            )
            // Set auth cookie and return chat info - NO MODAL SHOWN
            const response = addCorsHeaders(
              createSuccessResponse({
                id: deployment.id,
                title: deployment.title,
                description: deployment.description,
                customizations: deployment.customizations,
                authType: deployment.authType,
                outputConfigs: deployment.outputConfigs,
                inputFields, // Include input fields so all users can see the form
              }),
              request
            )
            setChatAuthCookie(response, deployment.id, deployment.authType)
            return response
          }

          logger.warn(
            `[${requestId}] User email ${userEmail} is not in allowed list. Will show modal for email entry.`
          )
          logger.debug(`[${requestId}] User email: ${userEmail}, Allowed emails:`, allowedEmails)
          // Don't return error here - let the modal show for manual email entry
          // User might want to enter a different email that is in the allowed list
        }
      } catch (error) {
        logger.error(`[${requestId}] Error checking session:`, error)
        // Continue with standard auth check below
      }
    }

    // If no valid cookie and user wasn't auto-authenticated, proceed with standard auth check
    const authResult = await validateChatAuth(requestId, deployment, request)
    if (!authResult.authorized) {
      logger.info(
        `[${requestId}] Authentication required for chat: ${subdomain}, type: ${deployment.authType}`
      )
      return addCorsHeaders(
        createErrorResponse(authResult.error || 'Authentication required', 401),
        request
      )
    }

    // Return public information about the chat including auth type
    return addCorsHeaders(
      createSuccessResponse({
        id: deployment.id,
        title: deployment.title,
        description: deployment.description,
        customizations: deployment.customizations,
        authType: deployment.authType,
        outputConfigs: deployment.outputConfigs,
        inputFields, // Include input fields so all users can see the form
      }),
      request
    )
  } catch (error: any) {
    logger.error(`[${requestId}] Error fetching chat info:`, error)
    return addCorsHeaders(
      createErrorResponse(error.message || 'Failed to fetch chat information', 500),
      request
    )
  }
}
