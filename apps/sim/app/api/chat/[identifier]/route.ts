import { randomUUID } from 'crypto'
import { db } from '@sim/db'
import { chat, deployedChat, workflowExecutionLogs } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { generateRequestId } from '@/lib/core/utils/request'
import { preprocessExecution } from '@/lib/execution/preprocessing'
import { createLogger } from '@/lib/logs/console/logger'
import { LoggingSession } from '@/lib/logs/execution/logging-session'
import * as ChatFiles from '@/lib/uploads/contexts/chat'
import { loadDeployedWorkflowState } from '@/lib/workflows/persistence/utils'
import type { InputFormatField } from '@/lib/workflows/types'
import {
  addCorsHeaders,
  setChatAuthCookie,
  validateAuthToken,
  validateChatAuth,
} from '@/app/api/chat/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('ChatIdentifierAPI')

const chatFileSchema = z.object({
  name: z.string().min(1, 'File name is required'),
  type: z.string().min(1, 'File type is required'),
  size: z.number().positive('File size must be positive'),
  data: z.string().min(1, 'File data is required'),
  lastModified: z.number().optional(),
})

const chatPostBodySchema = z.object({
  input: z.string().optional(),
  password: z.string().optional(),
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
  conversationId: z.string().optional(),
  chatId: z.string().optional(), // chatId for tracking conversation context
  files: z.array(chatFileSchema).optional().default([]),
  // Additional Start Block inputs (custom fields from inputFormat)
  startBlockInputs: z.record(z.unknown()).optional(),
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  const { identifier } = await params
  const requestId = generateRequestId()

  try {
    logger.debug(`[${requestId}] Processing chat request for identifier: ${identifier}`)
    logger.debug(`[${requestId}] Request body:`, request.body)

    let parsedBody
    try {
      const rawBody = await request.json()
      const validation = chatPostBodySchema.safeParse(rawBody)

      if (!validation.success) {
        const errorMessage = validation.error.errors
          .map((err) => `${err.path.join('.')}: ${err.message}`)
          .join(', ')
        logger.warn(`[${requestId}] Validation error: ${errorMessage}`)
        return addCorsHeaders(
          createErrorResponse(`Invalid request body: ${errorMessage}`, 400),
          request
        )
      }

      parsedBody = validation.data
    } catch (_error) {
      return addCorsHeaders(createErrorResponse('Invalid request body', 400), request)
    }

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
      .where(eq(chat.identifier, identifier))
      .limit(1)

    if (deploymentResult.length === 0) {
      logger.warn(`[${requestId}] Chat not found for identifier: ${identifier}`)
      return addCorsHeaders(createErrorResponse('Chat not found', 404), request)
    }

    const deployment = deploymentResult[0]

    if (!deployment.isActive) {
      logger.warn(`[${requestId}] Chat is not active: ${identifier}`)

      const executionId = randomUUID()
      const loggingSession = new LoggingSession(
        deployment.workflowId,
        executionId,
        'chat',
        requestId
      )

      await loggingSession.safeStart({
        userId: deployment.userId,
        workspaceId: '', // Will be resolved if needed
        variables: {},
      })

      await loggingSession.safeCompleteWithError({
        error: {
          message: 'This chat is currently unavailable. The chat has been disabled.',
          stackTrace: undefined,
        },
        traceSpans: [],
      })

      return addCorsHeaders(createErrorResponse('This chat is currently unavailable', 403), request)
    }

    const authResult = await validateChatAuth(requestId, deployment, request, parsedBody)
    if (!authResult.authorized) {
      return addCorsHeaders(
        createErrorResponse(authResult.error || 'Authentication required', 401),
        request
      )
    }

    // Store chat details in deployed_chat table if chatId is provided
    // Ensures each chatId is added only once, even with concurrent requests
    if (parsedBody.chatId) {
      try {
        const chatId = parsedBody.chatId
        logger.debug(`[${requestId}] Processing chatId: ${chatId}`)

        // Get the executing user ID from session
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
        // Using both chatId and workflowId to ensure proper context
        const existingChat = await db
          .select({ id: deployedChat.id })
          .from(deployedChat)
          .where(eq(deployedChat.chatId, chatId))
          .limit(1)

        if (existingChat.length > 0) {
          // ChatId already exists - just update the timestamp and user ID
          const existingChatId = existingChat[0].id
          logger.debug(`[${requestId}] ChatId already exists, updating timestamp: ${chatId}`)

          await db
            .update(deployedChat)
            .set({
              updatedAt: new Date(),
              executingUserId: executingUserId || null,
            })
            .where(eq(deployedChat.id, existingChatId))

          logger.debug(`[${requestId}] Successfully updated existing chat: ${chatId}`)
        } else {
          // ChatId doesn't exist - create a new record
          // Prefer Start Block input values for title; otherwise use first 5 words of input
          const startBlockValues =
            parsedBody.startBlockInputs && typeof parsedBody.startBlockInputs === 'object'
              ? Object.values(parsedBody.startBlockInputs)
                  .filter((value) => value !== undefined && value !== null)
                  .map((value) => {
                    const stringValue = typeof value === 'string' ? value.trim() : `${value}`.trim()
                    return stringValue
                  })
                  .filter((value) => value.length > 0)
              : []

          const words = parsedBody.input?.trim().split(/\s+/).filter(Boolean) || []
          const title =
            startBlockValues.length > 0
              ? startBlockValues.join(', ')
              : words.slice(0, 5).join(' ') || 'New Chat'

          const deployedChatId = uuidv4()
          const now = new Date()

          logger.debug(`[${requestId}] Creating new deployed_chat record:`, {
            id: deployedChatId,
            chatId,
            title,
            workflowId: identifier,
            executingUserId,
          })

          try {
            await db.insert(deployedChat).values({
              id: deployedChatId,
              chatId,
              title,
              workflowId: identifier,
              executingUserId,
              createdAt: now,
              updatedAt: now,
            })

            logger.info(`[${requestId}] Successfully created new chat record: ${chatId}`)
          } catch (insertError: any) {
            // Handle race condition: if another request created the record between our check and insert
            if (
              insertError?.code === '23505' || // PostgreSQL unique violation
              (insertError instanceof Error && insertError.message.includes('unique'))
            ) {
              logger.debug(
                `[${requestId}] Race condition detected - chatId was created by another request: ${chatId}`
              )

              // Verify the record exists and update it
              const raceConditionCheck = await db
                .select({ id: deployedChat.id })
                .from(deployedChat)
                .where(eq(deployedChat.chatId, chatId))
                .limit(1)

              if (raceConditionCheck.length > 0) {
                await db
                  .update(deployedChat)
                  .set({
                    updatedAt: new Date(),
                    executingUserId: executingUserId || null,
                  })
                  .where(eq(deployedChat.id, raceConditionCheck[0].id))

                logger.debug(`[${requestId}] Updated chat record after race condition: ${chatId}`)
              }
            } else {
              // Re-throw if it's a different error
              throw insertError
            }
          }
        }
      } catch (error: any) {
        // Log error but don't fail the request - chat functionality should continue
        logger.error(`[${requestId}] Error storing chat details in deployed_chat table:`, {
          message: error.message,
          code: error.code,
          chatId: parsedBody.chatId,
        })
      }
    } else {
      logger.debug(`[${requestId}] No chatId (payload) provided in request body`)
    }

    const {
      input,
      password,
      email,
      conversationId,
      chatId: payload,
      files,
      startBlockInputs,
    } = parsedBody

    // Get userId from session for external chat API requests
    const session = await getSession()
    const userId = session?.user?.id || null

    if ((password || email) && !input) {
      const response = addCorsHeaders(createSuccessResponse({ authenticated: true }), request)

      setChatAuthCookie(response, deployment.id, deployment.authType)

      return response
    }

    // Check if we have any input: either input field, files, or startBlockInputs with values
    const hasStartBlockInputs =
      startBlockInputs &&
      typeof startBlockInputs === 'object' &&
      Object.keys(startBlockInputs).length > 0
    const hasStartBlockInputValues =
      hasStartBlockInputs &&
      Object.values(startBlockInputs).some(
        (value) => value !== null && value !== undefined && value !== ''
      )

    if (!input && (!files || files.length === 0) && !hasStartBlockInputValues) {
      return addCorsHeaders(createErrorResponse('No input provided', 400), request)
    }

    const executionId = randomUUID()

    const loggingSession = new LoggingSession(deployment.workflowId, executionId, 'chat', requestId)

    const preprocessResult = await preprocessExecution({
      workflowId: deployment.workflowId,
      userId: deployment.userId,
      triggerType: 'chat',
      executionId,
      requestId,
      checkRateLimit: false, // Chat bypasses rate limits
      checkDeployment: true, // Chat requires deployed workflows
      loggingSession,
    })

    if (!preprocessResult.success) {
      logger.warn(`[${requestId}] Preprocessing failed: ${preprocessResult.error?.message}`)
      return addCorsHeaders(
        createErrorResponse(
          preprocessResult.error?.message || 'Failed to process request',
          preprocessResult.error?.statusCode || 500
        ),
        request
      )
    }

    const { actorUserId, workflowRecord } = preprocessResult
    const workspaceOwnerId = actorUserId!
    const workspaceId = workflowRecord?.workspaceId || ''

    // Start logging session with chat metadata
    await loggingSession.safeStart({
      userId: userId || workspaceOwnerId,
      workspaceId,
      variables: {},
      isExternalChat: true,
      chatId: payload || conversationId || undefined,
      initialInput: input || undefined,
    })

    try {
      const selectedOutputs: string[] = []
      if (deployment.outputConfigs && Array.isArray(deployment.outputConfigs)) {
        for (const config of deployment.outputConfigs) {
          const outputId = config.path
            ? `${config.blockId}_${config.path}`
            : `${config.blockId}_content`
          selectedOutputs.push(outputId)
        }
      }

      const { createStreamingResponse } = await import('@/lib/workflows/streaming/streaming')
      const { SSE_HEADERS } = await import('@/lib/core/utils/sse')
      const executeRoute = await import('@/app/api/workflows/[id]/execute/route')
      const createFilteredResult = (executeRoute as any).createFilteredResult

      const workflowInput: any = { input, conversationId }

      // Merge additional Start Block inputs (custom fields from inputFormat)
      // Always merge to ensure all Start Block fields are included, even if empty
      if (startBlockInputs && typeof startBlockInputs === 'object') {
        Object.assign(workflowInput, startBlockInputs)
        logger.debug(
          `[${requestId}] Merged ${Object.keys(startBlockInputs).length} Start Block inputs`
        )
      } else {
        // Even if startBlockInputs is not provided, ensure empty values for consistency
        // The client should always send startBlockInputs, but this is a safety check
        logger.debug(`[${requestId}] No Start Block inputs provided in request`)
      }

      if (files && Array.isArray(files) && files.length > 0) {
        const executionContext = {
          workspaceId,
          workflowId: deployment.workflowId,
          executionId,
        }

        try {
          const uploadedFiles = await ChatFiles.processChatFiles(
            files,
            executionContext,
            requestId,
            deployment.userId
          )

          if (uploadedFiles.length > 0) {
            workflowInput.files = uploadedFiles
            logger.info(`[${requestId}] Successfully processed ${uploadedFiles.length} files`)
          }
        } catch (fileError: any) {
          logger.error(`[${requestId}] Failed to process chat files:`, fileError)

          await loggingSession.safeStart({
            userId: workspaceOwnerId,
            workspaceId,
            variables: {},
          })

          await loggingSession.safeCompleteWithError({
            error: {
              message: `File upload failed: ${fileError.message || 'Unable to process uploaded files'}`,
              stackTrace: fileError.stack,
            },
            traceSpans: [],
          })

          throw fileError
        }
      }

      const workflowForExecution = {
        id: deployment.workflowId,
        userId: deployment.userId,
        workspaceId,
        isDeployed: workflowRecord?.isDeployed ?? false,
        variables: workflowRecord?.variables || {},
      }

      const originalStream = await createStreamingResponse({
        requestId,
        workflow: workflowForExecution,
        input: workflowInput,
        executingUserId: workspaceOwnerId,
        streamConfig: {
          selectedOutputs,
          isSecureMode: true,
          workflowTriggerType: 'chat',
        },
        createFilteredResult,
        executionId,
      })

      // Wrap the stream to capture final output and update workflowExecutionLogs
      const wrappedStream = new ReadableStream({
        async start(controller) {
          const reader = originalStream.getReader()
          const decoder = new TextDecoder()
          const encoder = new TextEncoder()
          let buffer = ''
          let accumulatedContent = ''

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              // Decode and process the chunk
              const chunk = decoder.decode(value, { stream: true })
              buffer += chunk

              // Process complete SSE messages
              const lines = buffer.split('\n\n')
              buffer = lines.pop() || ''

              for (const line of lines) {
                if (!line.trim() || !line.startsWith('data: ')) {
                  controller.enqueue(encoder.encode(`${line}\n\n`))
                  continue
                }

                const data = line.substring(6).trim()
                if (data === '[DONE]') {
                  controller.enqueue(encoder.encode(`${line}\n\n`))
                  continue
                }

                try {
                  const json = JSON.parse(data)
                  const { event, data: eventData, chunk: contentChunk } = json

                  // Capture streaming content chunks
                  if (contentChunk) {
                    accumulatedContent += contentChunk
                  }

                  // Handle final event - format output and update log
                  if (event === 'final' && eventData) {
                    const finalData = eventData as {
                      success: boolean
                      error?: string | { message?: string }
                      output?: Record<string, Record<string, any>>
                    }

                    // Format final output based on outputConfigs
                    let finalChatOutput = accumulatedContent.trim()

                    if (
                      deployment.outputConfigs &&
                      Array.isArray(deployment.outputConfigs) &&
                      finalData.output
                    ) {
                      const formatValue = (value: any): string | null => {
                        if (value === null || value === undefined) {
                          return null
                        }
                        if (typeof value === 'string') {
                          return value
                        }
                        if (typeof value === 'object') {
                          try {
                            return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
                          } catch {
                            return String(value)
                          }
                        }
                        return String(value)
                      }

                      const getOutputValue = (blockOutputs: Record<string, any>, path?: string) => {
                        if (!path || path === 'content') {
                          if (blockOutputs.content !== undefined) return blockOutputs.content
                          if (blockOutputs.result !== undefined) return blockOutputs.result
                          return blockOutputs
                        }
                        if (blockOutputs[path] !== undefined) {
                          return blockOutputs[path]
                        }
                        if (path.includes('.')) {
                          return path.split('.').reduce<any>((current, segment) => {
                            if (current && typeof current === 'object' && segment in current) {
                              return current[segment]
                            }
                            return undefined
                          }, blockOutputs)
                        }
                        return undefined
                      }

                      const formattedOutputs: string[] = []
                      for (const config of deployment.outputConfigs) {
                        const blockOutputs = finalData.output[config.blockId]
                        if (!blockOutputs) continue

                        const value = getOutputValue(blockOutputs, config.path)
                        const formatted = formatValue(value)
                        if (formatted) {
                          formattedOutputs.push(formatted)
                        }
                      }

                      if (formattedOutputs.length > 0) {
                        const trimmedStreamingContent = accumulatedContent.trim()
                        const uniqueOutputs = formattedOutputs.filter((output) => {
                          const trimmedOutput = output.trim()
                          if (!trimmedOutput) return false
                          if (
                            trimmedStreamingContent &&
                            trimmedOutput === trimmedStreamingContent
                          ) {
                            return false
                          }
                          return true
                        })

                        if (uniqueOutputs.length > 0) {
                          const combinedOutputs = uniqueOutputs.join('\n\n')
                          finalChatOutput = finalChatOutput
                            ? `${finalChatOutput}\n\n${combinedOutputs}`
                            : combinedOutputs
                        }
                      }
                    }

                    // Update workflowExecutionLogs with final output directly in database
                    // (logging session is already completed by streaming code)
                    if (finalChatOutput) {
                      try {
                        await db
                          .update(workflowExecutionLogs)
                          .set({
                            finalChatOutput,
                          })
                          .where(eq(workflowExecutionLogs.executionId, executionId))
                        logger.debug(
                          `[${requestId}] Updated finalChatOutput for execution ${executionId}`
                        )
                      } catch (updateError) {
                        logger.error(
                          `[${requestId}] Failed to update finalChatOutput:`,
                          updateError
                        )
                      }
                    }
                  }

                  // Pass through the original data
                  controller.enqueue(encoder.encode(`${line}\n\n`))
                } catch (parseError) {
                  // If parsing fails, just pass through the original line
                  controller.enqueue(encoder.encode(`${line}\n\n`))
                }
              }
            }
          } catch (error) {
            logger.error(`[${requestId}] Error in stream wrapper:`, error)
            controller.error(error)
          } finally {
            reader.releaseLock()
            controller.close()
          }
        },
      })

      const streamResponse = new NextResponse(wrappedStream, {
        status: 200,
        headers: SSE_HEADERS,
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  const { identifier } = await params
  const requestId = generateRequestId()

  try {
    logger.debug(`[${requestId}] Fetching chat info for identifier: ${identifier}`)

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
      .where(eq(chat.identifier, identifier))
      .limit(1)

    if (deploymentResult.length === 0) {
      logger.warn(`[${requestId}] Chat not found for identifier: ${identifier}`)
      return addCorsHeaders(createErrorResponse('Chat not found', 404), request)
    }

    const deployment = deploymentResult[0]

    if (!deployment.isActive) {
      logger.warn(`[${requestId}] Chat is not active: ${identifier}`)
      return addCorsHeaders(createErrorResponse('This chat is currently unavailable', 403), request)
    }

    const cookieName = `chat_auth_${deployment.id}`
    const authCookie = request.cookies.get(cookieName)

    if (
      deployment.authType !== 'public' &&
      authCookie &&
      validateAuthToken(authCookie.value, deployment.id)
    ) {
      return addCorsHeaders(
        createSuccessResponse({
          id: deployment.id,
          title: deployment.title,
          description: deployment.description,
          customizations: deployment.customizations,
          authType: deployment.authType,
          outputConfigs: deployment.outputConfigs,
        }),
        request
      )
    }

    // Auto-authenticate email-protected chats using session email; otherwise deny access
    if (deployment.authType === 'email') {
      try {
        const session = await getSession()
        const userEmail = session?.user?.email?.toLowerCase().trim()

        if (!userEmail) {
          logger.warn(`[${requestId}] No session email found for chat: ${identifier}`)
          return addCorsHeaders(
            createErrorResponse('You do not have access to this chat', 403),
            request
          )
        }

        const allowedEmails: string[] = Array.isArray(deployment.allowedEmails)
          ? deployment.allowedEmails
          : []

        const isEmailAllowed =
          allowedEmails.includes(userEmail) ||
          allowedEmails.some((allowed: string) => {
            if (allowed.startsWith('@')) {
              const domain = userEmail.split('@')[1]
              return domain && allowed === `@${domain}`
            }
            return false
          })

        if (isEmailAllowed) {
          logger.info(
            `[${requestId}] Auto-authenticating user ${userEmail} for chat: ${identifier}`
          )
          const response = addCorsHeaders(
            createSuccessResponse({
              id: deployment.id,
              title: deployment.title,
              description: deployment.description,
              customizations: deployment.customizations,
              authType: deployment.authType,
              outputConfigs: deployment.outputConfigs,
            }),
            request
          )
          setChatAuthCookie(response, deployment.id, deployment.authType)
          return response
        }

        logger.warn(`[${requestId}] User ${userEmail} is not authorized for chat: ${identifier}`)
        return addCorsHeaders(
          createErrorResponse('You do not have access to this chat', 403),
          request
        )
      } catch (error) {
        logger.warn(`[${requestId}] Error checking session email:`, error)
        return addCorsHeaders(
          createErrorResponse('You do not have access to this chat', 403),
          request
        )
      }
    }

    const authResult = await validateChatAuth(requestId, deployment, request)
    if (!authResult.authorized) {
      logger.info(
        `[${requestId}] Authentication required for chat: ${identifier}, type: ${deployment.authType}`
      )
      return addCorsHeaders(
        createErrorResponse(authResult.error || 'Authentication required', 401),
        request
      )
    }

    // Extract Start Block inputFormat for chat UI
    let inputFormat: InputFormatField[] = []
    try {
      const deployedData = await loadDeployedWorkflowState(deployment.workflowId)
      // Find Start Block manually from BlockState
      const startBlock = Object.values(deployedData.blocks).find(
        (block) => block.type === 'start_trigger' || block.type === 'starter'
      )
      if (startBlock?.subBlocks?.inputFormat?.value) {
        const inputFormatValue = startBlock.subBlocks.inputFormat.value
        if (Array.isArray(inputFormatValue)) {
          inputFormat = inputFormatValue
            .filter((field) => {
              return (
                field !== null &&
                field !== undefined &&
                typeof field === 'object' &&
                !Array.isArray(field) &&
                'name' in field &&
                typeof (field as any).name === 'string'
              )
            })
            .map((field: any) => ({
              name: field.name,
              type: field.type,
              value: field.value,
            }))
        }
      }
    } catch (error) {
      logger.warn(`[${requestId}] Failed to extract inputFormat:`, error)
      // Continue without inputFormat - not critical for chat config
    }

    return addCorsHeaders(
      createSuccessResponse({
        id: deployment.id,
        title: deployment.title,
        description: deployment.description,
        customizations: deployment.customizations,
        authType: deployment.authType,
        outputConfigs: deployment.outputConfigs,
        inputFormat,
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
