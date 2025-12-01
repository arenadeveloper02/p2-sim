import { eq, sql } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { checkServerSideUsageLimits } from '@/lib/billing'
import { isDev } from '@/lib/environment'
import { getPersonalAndWorkspaceEnv } from '@/lib/environment/utils'
import { createLogger } from '@/lib/logs/console/logger'
import { LoggingSession } from '@/lib/logs/execution/logging-session'
import { buildTraceSpans } from '@/lib/logs/execution/trace-spans/trace-spans'
import { hasAdminPermission } from '@/lib/permissions/utils'
import { processStreamingBlockLogs } from '@/lib/tokenization'
import { getEmailDomain } from '@/lib/urls/utils'
import { decryptSecret, generateRequestId } from '@/lib/utils'
import { getBlock } from '@/blocks'
import { db } from '@/db'
import { chat, deployedChatHistory, userStats, workflow } from '@/db/schema'
import { Executor } from '@/executor'
import type { BlockLog, ExecutionResult } from '@/executor/types'
import { Serializer } from '@/serializer'
import { mergeSubblockState } from '@/stores/workflows/server-utils'
import type { WorkflowState } from '@/stores/workflows/workflow/types'

declare global {
  var __chatStreamProcessingTasks: Promise<{ success: boolean; error?: any }>[] | undefined
}

const logger = createLogger('ChatAuthUtils')

/**
 * Check if user has permission to create a chat for a specific workflow
 * Either the user owns the workflow directly OR has admin permission for the workflow's workspace
 */
export async function checkWorkflowAccessForChatCreation(
  workflowId: string,
  userId: string
): Promise<{ hasAccess: boolean; workflow?: any }> {
  // Get workflow data
  const workflowData = await db.select().from(workflow).where(eq(workflow.id, workflowId)).limit(1)

  if (workflowData.length === 0) {
    return { hasAccess: false }
  }

  const workflowRecord = workflowData[0]

  // Case 1: User owns the workflow directly
  if (workflowRecord.userId === userId) {
    return { hasAccess: true, workflow: workflowRecord }
  }

  // Case 2: Workflow belongs to a workspace and user has admin permission
  if (workflowRecord.workspaceId) {
    const hasAdmin = await hasAdminPermission(userId, workflowRecord.workspaceId)
    if (hasAdmin) {
      return { hasAccess: true, workflow: workflowRecord }
    }
  }

  return { hasAccess: false }
}

/**
 * Check if user has access to view/edit/delete a specific chat
 * Either the user owns the chat directly OR has admin permission for the workflow's workspace
 */
export async function checkChatAccess(
  chatId: string,
  userId: string
): Promise<{ hasAccess: boolean; chat?: any }> {
  // Get chat with workflow information
  const chatData = await db
    .select({
      chat: chat,
      workflowWorkspaceId: workflow.workspaceId,
    })
    .from(chat)
    .innerJoin(workflow, eq(chat.workflowId, workflow.id))
    .where(eq(chat.id, chatId))
    .limit(1)

  if (chatData.length === 0) {
    return { hasAccess: false }
  }

  const { chat: chatRecord, workflowWorkspaceId } = chatData[0]

  // Case 1: User owns the chat directly
  if (chatRecord.userId === userId) {
    return { hasAccess: true, chat: chatRecord }
  }

  // Case 2: Chat's workflow belongs to a workspace and user has admin permission
  if (workflowWorkspaceId) {
    const hasAdmin = await hasAdminPermission(userId, workflowWorkspaceId)
    if (hasAdmin) {
      return { hasAccess: true, chat: chatRecord }
    }
  }

  return { hasAccess: false }
}

export const encryptAuthToken = (subdomainId: string, type: string): string => {
  return Buffer.from(`${subdomainId}:${type}:${Date.now()}`).toString('base64')
}

export const validateAuthToken = (token: string, subdomainId: string): boolean => {
  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const [storedId, _type, timestamp] = decoded.split(':')

    // Check if token is for this subdomain
    if (storedId !== subdomainId) {
      return false
    }

    // Check if token is not expired (24 hours)
    const createdAt = Number.parseInt(timestamp)
    const now = Date.now()
    const expireTime = 24 * 60 * 60 * 1000 // 24 hours

    if (now - createdAt > expireTime) {
      return false
    }

    return true
  } catch (_e) {
    return false
  }
}

// Set cookie helper function
export const setChatAuthCookie = (
  response: NextResponse,
  subdomainId: string,
  type: string
): void => {
  const token = encryptAuthToken(subdomainId, type)
  // Set cookie with HttpOnly and secure flags
  response.cookies.set({
    name: `chat_auth_${subdomainId}`,
    value: token,
    httpOnly: true,
    secure: !isDev,
    sameSite: 'lax',
    path: '/',
    // Using subdomain for the domain in production
    domain: isDev ? undefined : `.${getEmailDomain()}`,
    maxAge: 60 * 60 * 24, // 24 hours
  })
}

// Helper function to add CORS headers to responses
export function addCorsHeaders(response: NextResponse, request: NextRequest) {
  // Get the origin from the request
  const origin = request.headers.get('origin') || ''

  // In development, allow any localhost subdomain
  if (isDev && origin.includes('localhost')) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With')
  }

  return response
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 })
  return addCorsHeaders(response, request)
}

// Validate authentication for chat access
export async function validateChatAuth(
  requestId: string,
  deployment: any,
  request: NextRequest,
  parsedBody?: any
): Promise<{ authorized: boolean; error?: string }> {
  const authType = deployment.authType || 'public'

  // Public chats are accessible to everyone
  if (authType === 'public') {
    return { authorized: true }
  }

  // Check for auth cookie first
  const cookieName = `chat_auth_${deployment.id}`
  const authCookie = request.cookies.get(cookieName)

  if (authCookie && validateAuthToken(authCookie.value, deployment.id)) {
    return { authorized: true }
  }

  // For password protection, check the password in the request body
  if (authType === 'password') {
    // For GET requests, we just notify the client that authentication is required
    if (request.method === 'GET') {
      return { authorized: false, error: 'auth_required_password' }
    }

    try {
      // Use the parsed body if provided, otherwise the auth check is not applicable
      if (!parsedBody) {
        return { authorized: false, error: 'Password is required' }
      }

      const { password, input } = parsedBody

      // If this is a chat message, not an auth attempt
      if (input && !password) {
        return { authorized: false, error: 'auth_required_password' }
      }

      if (!password) {
        return { authorized: false, error: 'Password is required' }
      }

      if (!deployment.password) {
        logger.error(`[${requestId}] No password set for password-protected chat: ${deployment.id}`)
        return { authorized: false, error: 'Authentication configuration error' }
      }

      // Decrypt the stored password and compare
      const { decrypted } = await decryptSecret(deployment.password)
      if (password !== decrypted) {
        return { authorized: false, error: 'Invalid password' }
      }

      return { authorized: true }
    } catch (error) {
      logger.error(`[${requestId}] Error validating password:`, error)
      return { authorized: false, error: 'Authentication error' }
    }
  }

  // For email access control, check the email in the request body
  if (authType === 'email') {
    // For GET requests, just notify that authentication is required
    if (request.method === 'GET') {
      return { authorized: false, error: 'auth_required_email' }
    }

    try {
      // Ensure request body is parsed
      if (!parsedBody) {
        return { authorized: false, error: 'Email is required' }
      }

      const { email, input } = parsedBody

      // If chat message sent before email auth
      if (input && !email) {
        return { authorized: false, error: 'auth_required_email' }
      }

      if (!email) {
        return { authorized: false, error: 'Email is required' }
      }

      const allowedEmails = deployment.allowedEmails || []

      // Normalize email for case-insensitive comparison and trim whitespace
      const normalizedEmail = email.toLowerCase().trim()

      logger.debug(`[${requestId}] Validating email for chat:`, {
        submittedEmail: email,
        normalizedEmail,
        allowedEmails,
      })

      // Check if email is explicitly allowed (case-insensitive)
      const isEmailAllowed =
        allowedEmails.some((allowed: string) => allowed.toLowerCase().trim() === normalizedEmail) ||
        // Check if domain (e.g. "@example.com") is allowed
        allowedEmails.some(
          (allowed: string) =>
            allowed.startsWith('@') && normalizedEmail.endsWith(allowed.toLowerCase().trim())
        )

      logger.debug(`[${requestId}] Email validation result:`, {
        isEmailAllowed,
        email,
      })

      if (isEmailAllowed) {
        // Directly authorize if email is in allowed list
        return { authorized: true }
      }

      // If not allowed, deny access
      return { authorized: false, error: 'Email not authorized' }
    } catch (error) {
      logger.error(`[${requestId}] Error validating email:`, error)
      return { authorized: false, error: 'Authentication error' }
    }
  }

  // Unknown auth type
  return { authorized: false, error: 'Unsupported authentication type' }
}

/**
 * Executes a workflow for a chat request and returns the formatted output.
 *
 * When workflows reference <start.input>, they receive the input directly.
 * The conversationId is available at <start.conversationId> for maintaining chat context.
 *
 * @param chatId - Chat deployment identifier
 * @param input - User's chat input
 * @param conversationId - Optional ID for maintaining conversation context
 * @returns Workflow execution result formatted for the chat interface
 */
export async function executeWorkflowForChat(
  chatId: string,
  input: string,
  conversationId?: string,
  workflowInputs?: Record<string, any>,
  logChatId?: string,
  executingUserId?: string,
  workflowId?: string
): Promise<any> {
  const requestId = generateRequestId()

  logger.debug(
    `[${requestId}] Executing workflow for chat: ${chatId}${
      conversationId ? `, conversationId: ${conversationId}` : ''
    }${workflowInputs ? `, workflowInputs: ${JSON.stringify(workflowInputs)}` : ''}`
  )

  // Find the chat deployment
  const deploymentResult = await db
    .select({
      id: chat.id,
      workflowId: chat.workflowId,
      userId: chat.userId,
      outputConfigs: chat.outputConfigs,
      customizations: chat.customizations,
    })
    .from(chat)
    .where(eq(chat.id, chatId))
    .limit(1)

  if (deploymentResult.length === 0) {
    logger.warn(`[${requestId}] Chat not found: ${chatId}`)
    throw new Error('Chat not found')
  }

  const deployment = deploymentResult[0]
  // Use passed workflowId if provided, otherwise use deployment.workflowId
  const finalWorkflowId = workflowId || deployment.workflowId
  const executionId = uuidv4()

  const usageCheck = await checkServerSideUsageLimits(deployment.userId)
  if (usageCheck.isExceeded) {
    logger.warn(
      `[${requestId}] User ${deployment.userId} has exceeded usage limits. Skipping chat execution.`,
      {
        currentUsage: usageCheck.currentUsage,
        limit: usageCheck.limit,
        workflowId: deployment.workflowId,
        chatId,
      }
    )
    throw new Error(
      usageCheck.message || 'Usage limit exceeded. Please upgrade your plan to continue using chat.'
    )
  }

  // Set up logging for chat execution
  const loggingSession = new LoggingSession(
    finalWorkflowId,
    executionId,
    'chat',
    requestId,
    true,
    logChatId || chatId
  )

  // Store the initial input for logging into execution_data.traceSpans.initial_input
  loggingSession.setInitialInput(input)

  // Check for multi-output configuration in customizations
  const customizations = (deployment.customizations || {}) as Record<string, any>
  let outputBlockIds: string[] = []

  // Extract output configs from the new schema format
  // Remove duplicates to prevent processing the same outputId multiple times
  let selectedOutputIds: string[] = []
  if (deployment.outputConfigs && Array.isArray(deployment.outputConfigs)) {
    // Extract output IDs in the format expected by the streaming processor
    logger.debug(
      `[${requestId}] Found ${deployment.outputConfigs.length} output configs in deployment`
    )

    selectedOutputIds = Array.from(
      new Set(
        deployment.outputConfigs.map((config) => {
          const outputId = config.path
            ? `${config.blockId}_${config.path}`
            : `${config.blockId}.content`

          logger.debug(
            `[${requestId}] Processing output config: blockId=${config.blockId}, path=${config.path || 'content'} -> outputId=${outputId}`
          )

          return outputId
        })
      )
    )

    // Also extract block IDs for legacy compatibility
    outputBlockIds = deployment.outputConfigs.map((config) => config.blockId)
  } else {
    // Use customizations as fallback
    outputBlockIds = Array.isArray(customizations.outputBlockIds)
      ? customizations.outputBlockIds
      : []
  }

  // Fall back to customizations if we still have no outputs
  if (
    outputBlockIds.length === 0 &&
    customizations.outputBlockIds &&
    customizations.outputBlockIds.length > 0
  ) {
    outputBlockIds = customizations.outputBlockIds
  }

  logger.debug(
    `[${requestId}] Using ${outputBlockIds.length} output blocks and ${selectedOutputIds.length} selected output IDs for extraction`
  )

  // Find the workflow (deployedState is NOT deprecated - needed for chat execution)
  const workflowResult = await db
    .select({
      isDeployed: workflow.isDeployed,
      deployedState: workflow.deployedState,
      variables: workflow.variables,
    })
    .from(workflow)
    .where(eq(workflow.id, finalWorkflowId))
    .limit(1)

  if (workflowResult.length === 0 || !workflowResult[0].isDeployed) {
    logger.warn(`[${requestId}] Workflow not found or not deployed: ${finalWorkflowId}`)
    throw new Error('Workflow not available')
  }

  // For chat execution, use ONLY the deployed state (no fallback)
  if (!workflowResult[0].deployedState) {
    throw new Error(`Workflow must be deployed to be available for chat`)
  }

  // Use deployed state for chat execution (this is the stable, deployed version)
  const deployedState = workflowResult[0].deployedState as WorkflowState
  const { blocks, edges, loops, parallels } = deployedState

  // Prepare for execution, similar to use-workflow-execution.ts
  const mergedStates = mergeSubblockState(blocks)

  const filteredStates = Object.entries(mergedStates).reduce(
    (acc, [id, block]) => {
      const blockConfig = getBlock(block.type)
      const isTriggerBlock = blockConfig?.category === 'triggers'

      // Skip trigger blocks during chat execution
      if (!isTriggerBlock) {
        acc[id] = block
      }
      return acc
    },
    {} as typeof mergedStates
  )

  const currentBlockStates = Object.entries(filteredStates).reduce(
    (acc, [id, block]) => {
      acc[id] = Object.entries(block.subBlocks).reduce(
        (subAcc, [key, subBlock]) => {
          subAcc[key] = subBlock.value
          return subAcc
        },
        {} as Record<string, any>
      )

      return acc
    },
    {} as Record<string, Record<string, any>>
  )

  // Get user environment variables with workspace precedence
  let envVars: Record<string, string> = {}
  try {
    const wfWorkspaceRow = await db
      .select({ workspaceId: workflow.workspaceId })
      .from(workflow)
      .where(eq(workflow.id, finalWorkflowId))
      .limit(1)

    const workspaceId = wfWorkspaceRow[0]?.workspaceId || undefined
    const { personalEncrypted, workspaceEncrypted } = await getPersonalAndWorkspaceEnv(
      deployment.userId,
      workspaceId
    )
    envVars = { ...personalEncrypted, ...workspaceEncrypted }
  } catch (error) {
    logger.warn(`[${requestId}] Could not fetch environment variables:`, error)
  }

  let workflowVariables = {}
  try {
    if (workflowResult[0].variables) {
      workflowVariables =
        typeof workflowResult[0].variables === 'string'
          ? JSON.parse(workflowResult[0].variables)
          : workflowResult[0].variables
    }
  } catch (error) {
    logger.warn(`[${requestId}] Could not parse workflow variables:`, error)
  }

  // Filter edges to exclude connections to/from trigger blocks (same as manual execution)
  const triggerBlockIds = Object.keys(mergedStates).filter((id) => {
    const blockConfig = getBlock(mergedStates[id].type)
    return blockConfig?.category === 'triggers'
  })

  const filteredEdges = edges.filter(
    (edge) => !triggerBlockIds.includes(edge.source) && !triggerBlockIds.includes(edge.target)
  )

  // Create serialized workflow with filtered blocks and edges
  const serializedWorkflow = new Serializer().serializeWorkflow(
    filteredStates,
    filteredEdges,
    loops,
    parallels,
    true // Enable validation during execution
  )

  // Decrypt environment variables
  const decryptedEnvVars: Record<string, string> = {}
  for (const [key, encryptedValue] of Object.entries(envVars)) {
    try {
      const { decrypted } = await decryptSecret(encryptedValue)
      decryptedEnvVars[key] = decrypted
    } catch (error: any) {
      logger.error(`[${requestId}] Failed to decrypt environment variable "${key}"`, error)
      // Log but continue - we don't want to break execution if just one var fails
    }
  }

  // Merge system-level environment variables as fallback
  // This ensures system-level API keys (like OPENAI_API_KEY) are available
  // when user hasn't set them in their personal/workspace env vars
  const { mergeSystemEnvironmentVariables } = await import('@/lib/environment/utils')
  const finalEnvVars = mergeSystemEnvironmentVariables(decryptedEnvVars)

  // Process block states to ensure response formats are properly parsed
  const processedBlockStates = Object.entries(currentBlockStates).reduce(
    (acc, [blockId, blockState]) => {
      // Check if this block has a responseFormat that needs to be parsed
      if (blockState.responseFormat && typeof blockState.responseFormat === 'string') {
        try {
          logger.debug(`[${requestId}] Parsing responseFormat for block ${blockId}`)
          // Attempt to parse the responseFormat if it's a string
          const parsedResponseFormat = JSON.parse(blockState.responseFormat)

          acc[blockId] = {
            ...blockState,
            responseFormat: parsedResponseFormat,
          }
        } catch (error) {
          logger.warn(`[${requestId}] Failed to parse responseFormat for block ${blockId}`, error)
          acc[blockId] = blockState
        }
      } else {
        acc[blockId] = blockState
      }
      return acc
    },
    {} as Record<string, Record<string, any>>
  )

  // Start logging session
  await loggingSession.safeStart({
    userId: executingUserId || deployment.userId,
    workspaceId: '', // TODO: Get from workflow
    variables: workflowVariables,
  })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const streamedContent = new Map<string, string>()
      const streamedBlocks = new Set<string>() // Track which blocks have started streaming

      const onStream = async (streamingExecution: any): Promise<void> => {
        if (!streamingExecution.stream) return

        const blockId = streamingExecution.execution?.blockId
        const reader = streamingExecution.stream.getReader()

        // Check if this block should stream content to the client
        // Only stream if the selected path is "content" (or undefined/default)
        let shouldStreamToClient = true
        if (blockId && selectedOutputIds.length > 0) {
          const matchingOutputId = selectedOutputIds.find((outputId) => {
            const blockIdForOutput = outputId.includes('_')
              ? outputId.split('_')[0]
              : outputId.split('.')[0]
            return blockIdForOutput === blockId
          })

          if (matchingOutputId) {
            // Extract the path from the outputId
            const path = matchingOutputId.includes('_')
              ? matchingOutputId.substring(blockId.length + 1)
              : matchingOutputId.includes('.')
                ? matchingOutputId.substring(blockId.length + 1)
                : 'content' // Default to content if no path specified

            // Only stream to client if the selected path is "content" or undefined
            // For other paths (like "model", "tokens", etc.), we'll extract them from the final output
            shouldStreamToClient = path === 'content' || path === ''
          } else {
            // Block is not in selectedOutputIds, don't stream
            shouldStreamToClient = false
          }
        }

        if (blockId) {
          streamedContent.set(blockId, '')

          // Only send separator and track streaming if we're actually streaming to client
          if (shouldStreamToClient) {
            // Add separator if this is not the first block to stream
            if (streamedBlocks.size > 0) {
              // Send separator before the new block starts
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ blockId, chunk: '\n\n' })}\n\n`)
              )
            }
            streamedBlocks.add(blockId)
          }
        }
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              if (shouldStreamToClient) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ blockId, event: 'end' })}\n\n`)
                )
              }
              break
            }
            const chunk = new TextDecoder().decode(value)
            if (blockId) {
              // Always accumulate streamed content for executor processing
              streamedContent.set(blockId, (streamedContent.get(blockId) || '') + chunk)
            }
            // Only send chunks to client if we should stream this block's content
            if (shouldStreamToClient) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ blockId, chunk })}\n\n`))
            }
          }
        } catch (error) {
          logger.error('Error while reading from stream:', error)
          controller.error(error)
        }
      }

      // Merge workflow inputs into the workflow input
      const mergedWorkflowInput = {
        input: input,
        conversationId,
        ...(workflowInputs && Object.keys(workflowInputs).length > 0 ? workflowInputs : {}),
      }

      logger.debug(`[${requestId}] Merged workflow input:`, mergedWorkflowInput)

      const executor = new Executor({
        workflow: serializedWorkflow,
        currentBlockStates: processedBlockStates,
        envVarValues: finalEnvVars,
        workflowInput: mergedWorkflowInput,
        workflowVariables,
        contextExtensions: {
          stream: true,
          selectedOutputIds: selectedOutputIds.length > 0 ? selectedOutputIds : outputBlockIds,
          edges: filteredEdges.map((e: any) => ({
            source: e.source,
            target: e.target,
          })),
          onStream,
        },
      })

      // Set up logging on the executor
      loggingSession.setupExecutor(executor)

      let result
      try {
        result = await executor.execute(finalWorkflowId)
      } catch (error: any) {
        logger.error(`[${requestId}] Chat workflow execution failed:`, error)
        await loggingSession.safeCompleteWithError({
          endedAt: new Date().toISOString(),
          totalDurationMs: 0,
          error: {
            message: error.message || 'Chat workflow execution failed',
            stackTrace: error.stack,
          },
        })
        throw error
      }

      // Handle both ExecutionResult and StreamingExecution types
      const executionResult =
        result && typeof result === 'object' && 'execution' in result
          ? (result.execution as ExecutionResult)
          : (result as ExecutionResult)

      // Initialize enrichedResult early to ensure it's always available
      let enrichedResult: ExecutionResult & { traceSpans?: any; totalDuration?: number } =
        executionResult

      // Declare finalChatOutputs in outer scope so it's accessible later
      let finalChatOutputs: string[] = [] // For final_chat_output column (includes ALL selected outputs)

      if (executionResult?.logs) {
        // Update streamed content and apply tokenization - process regardless of overall success
        // This ensures partial successes (some agents succeed, some fail) still return results

        // Extract the exact same functions used by the chat panel
        const extractBlockIdFromOutputId = (outputId: string): string => {
          return outputId.includes('_') ? outputId.split('_')[0] : outputId.split('.')[0]
        }

        const extractPathFromOutputId = (outputId: string, blockId: string): string => {
          return outputId.substring(blockId.length + 1)
        }

        const parseOutputContentSafely = (output: any): any => {
          if (!output?.content) {
            return output
          }

          if (typeof output.content === 'string') {
            try {
              return JSON.parse(output.content)
            } catch (e) {
              // Fallback to original structure if parsing fails
              return output
            }
          }

          return output
        }

        // Add newlines between different agent outputs for better readability
        // Only process streamed blocks that are in the selected outputs
        const processedOutputs = new Set<string>()

        // First, filter to only selected streaming blocks
        if (selectedOutputIds.length > 0) {
          executionResult.logs.forEach((log: BlockLog) => {
            if (streamedContent.has(log.blockId)) {
              // Check if this block is in the selected outputs
              const blockIdForLog = log.blockId
              const isSelected = selectedOutputIds.some((outputId) => {
                const blockIdForOutput = extractBlockIdFromOutputId(outputId)
                return blockIdForOutput === blockIdForLog
              })

              if (isSelected) {
                const content = streamedContent.get(log.blockId)
                if (log.output && content) {
                  // Extract the path from the selected output ID if it exists
                  const matchingOutputId = selectedOutputIds.find((outputId) => {
                    const blockIdForOutput = extractBlockIdFromOutputId(outputId)
                    return blockIdForOutput === blockIdForLog
                  })

                  if (matchingOutputId) {
                    const path = extractPathFromOutputId(matchingOutputId, blockIdForLog)

                    // If a specific path is selected (not just "content"), extract it
                    if (path && path !== 'content') {
                      // Parse the content to extract the specific path
                      const parsedContent = parseOutputContentSafely(log.output)
                      const pathParts = path.split('.')
                      let extractedValue = parsedContent

                      for (const part of pathParts) {
                        if (
                          extractedValue &&
                          typeof extractedValue === 'object' &&
                          part in extractedValue
                        ) {
                          extractedValue = extractedValue[part]
                        } else {
                          extractedValue = undefined
                          break
                        }
                      }

                      if (extractedValue !== undefined) {
                        const separator = processedOutputs.size > 0 ? '\n\n' : ''
                        const formattedOutput =
                          typeof extractedValue === 'string'
                            ? extractedValue
                            : JSON.stringify(extractedValue, null, 2)
                        log.output.content = separator + formattedOutput
                        processedOutputs.add(log.blockId)
                      }
                    } else {
                      // Default to content field
                      const separator = processedOutputs.size > 0 ? '\n\n' : ''
                      log.output.content = separator + content
                      processedOutputs.add(log.blockId)
                    }
                  } else {
                    // Fallback: if no matching output ID found, use content as-is
                    const separator = processedOutputs.size > 0 ? '\n\n' : ''
                    log.output.content = separator + content
                    processedOutputs.add(log.blockId)
                  }
                }
              }
            }
          })
        } else {
          // If no output configs are set, process all streamed blocks (legacy behavior)
          executionResult.logs.forEach((log: BlockLog) => {
            if (streamedContent.has(log.blockId)) {
              const content = streamedContent.get(log.blockId)
              if (log.output && content) {
                const separator = processedOutputs.size > 0 ? '\n\n' : ''
                log.output.content = separator + content
                processedOutputs.add(log.blockId)
              }
            }
          })
        }

        // Also process non-streamed outputs from selected blocks (like function blocks)
        // This uses the same logic as the chat panel to ensure identical behavior
        const nonStreamingLogs = executionResult.logs.filter(
          (log: BlockLog) => !streamedContent.has(log.blockId)
        )

        // Filter outputs that have matching logs (exactly like chat panel)
        const outputsToRender =
          selectedOutputIds.length > 0
            ? selectedOutputIds.filter((outputId) => {
                const blockIdForOutput = extractBlockIdFromOutputId(outputId)
                return nonStreamingLogs.some((log) => log.blockId === blockIdForOutput)
              })
            : []

        // Process each selected output (exactly like chat panel)
        for (const outputId of outputsToRender) {
          const blockIdForOutput = extractBlockIdFromOutputId(outputId)
          const path = extractPathFromOutputId(outputId, blockIdForOutput)
          const log = nonStreamingLogs.find((l) => l.blockId === blockIdForOutput)

          if (log) {
            let outputValue: any = log.output

            if (path) {
              // Parse JSON content safely (exactly like chat panel)
              outputValue = parseOutputContentSafely(outputValue)

              const pathParts = path.split('.')
              for (const part of pathParts) {
                if (outputValue && typeof outputValue === 'object' && part in outputValue) {
                  outputValue = outputValue[part]
                } else {
                  outputValue = undefined
                  break
                }
              }
            }

            if (outputValue !== undefined) {
              // Add newline separation between different outputs
              const separator = processedOutputs.size > 0 ? '\n\n' : ''

              // Format the output exactly like the chat panel
              const formattedOutput =
                typeof outputValue === 'string' ? outputValue : JSON.stringify(outputValue, null, 2)

              // Update the log content
              if (!log.output.content) {
                log.output.content = separator + formattedOutput
              } else {
                log.output.content = separator + formattedOutput
              }
              processedOutputs.add(log.blockId)
            }
          }
        }

        // Process all logs for streaming tokenization
        const processedCount = processStreamingBlockLogs(executionResult.logs, streamedContent)
        logger.info(`Processed ${processedCount} blocks for streaming tokenization`)

        // Construct executionResult.output from selected blocks if outputConfigs are set
        // This ensures output.content matches what was streamed and respects selectedOutputIds
        if (selectedOutputIds.length > 0) {
          const selectedOutputs: string[] = [] // For executionResult.output.content (excludes streamed content)
          finalChatOutputs = [] // Initialize for final_chat_output column (includes ALL selected outputs)
          const aggregatedTokens = {
            prompt: 0,
            completion: 0,
            total: 0,
          }
          const aggregatedToolCalls: any[] = []
          let aggregatedModel: string | undefined
          const aggregatedFiles: any[] = []
          const processedBlocks = new Set<string>() // Track which blocks we've already processed for aggregation
          const processedOutputIds = new Set<string>() // Track processed outputIds to prevent duplicates
          const addedContentValues = new Set<string>() // Track added content values to prevent duplicates
          const addedFinalChatValues = new Set<string>() // Track added values for finalChatOutput

          // Collect outputs from all selected blocks (both streamed and non-streamed)
          // Iterate through selectedOutputIds to ensure all selected paths are processed
          // This handles cases where multiple paths are selected for the same block (e.g., both "content" and "model")
          selectedOutputIds.forEach((outputId) => {
            // Skip if we've already processed this exact outputId (prevent duplicates)
            if (processedOutputIds.has(outputId)) {
              return
            }

            const blockIdForOutput = extractBlockIdFromOutputId(outputId)
            const path = extractPathFromOutputId(outputId, blockIdForOutput)

            // Find the log for this block
            const log = executionResult.logs?.find((l: BlockLog) => l.blockId === blockIdForOutput)

            if (log?.output) {
              // Extract the content based on the selected path
              let extractedContent: string | undefined
              let extractedContentForFinalChat: string | undefined // Always extract for finalChatOutput

              if (path && path !== 'content') {
                // Extract specific path (e.g., "model", "tokens", etc.)
                // For non-content paths, access directly from log.output (not from parsed content)
                const pathParts = path.split('.')
                let extractedValue: any = log.output

                for (const part of pathParts) {
                  if (
                    extractedValue &&
                    typeof extractedValue === 'object' &&
                    part in extractedValue
                  ) {
                    extractedValue = extractedValue[part]
                  } else {
                    extractedValue = undefined
                    break
                  }
                }

                if (extractedValue !== undefined) {
                  const formattedValue =
                    typeof extractedValue === 'string'
                      ? extractedValue
                      : JSON.stringify(extractedValue, null, 2)
                  extractedContent = formattedValue
                  extractedContentForFinalChat = formattedValue
                }
              } else {
                // Default to content field
                // For finalChatOutput: Always include content (streamed or not)
                if (streamedContent.has(blockIdForOutput)) {
                  extractedContentForFinalChat = streamedContent.get(blockIdForOutput) || undefined
                } else {
                  extractedContentForFinalChat = log.output.content
                }

                // IMPORTANT: For streamed content paths, DO NOT include in final output.content
                // because it's already been streamed to the client. Only include non-streamed content.
                // This prevents duplication where the UI shows streamed content + final output.content
                const wasStreamed = streamedContent.has(blockIdForOutput)
                if (wasStreamed) {
                  // This content was streamed, so skip adding it to final output.content
                  // The UI will use the accumulated streamed text instead
                  extractedContent = undefined
                  logger.debug(
                    `[${requestId}] Skipping streamed content for block ${blockIdForOutput} in final output.content`
                  )
                } else {
                  // Non-streamed content, include it in final output
                  extractedContent = log.output.content
                  logger.debug(
                    `[${requestId}] Including non-streamed content for block ${blockIdForOutput} in final output.content`
                  )
                }
              }

              // Add to finalChatOutputs (includes ALL selected outputs, streamed or not)
              if (
                extractedContentForFinalChat &&
                typeof extractedContentForFinalChat === 'string' &&
                extractedContentForFinalChat.trim().length > 0
              ) {
                if (!addedFinalChatValues.has(extractedContentForFinalChat)) {
                  if (finalChatOutputs.length > 0) {
                    finalChatOutputs.push('\n\n')
                  }
                  finalChatOutputs.push(extractedContentForFinalChat)
                  addedFinalChatValues.add(extractedContentForFinalChat)
                }
              } else if (extractedContentForFinalChat) {
                const stringifiedContent = JSON.stringify(extractedContentForFinalChat, null, 2)
                if (!addedFinalChatValues.has(stringifiedContent)) {
                  if (finalChatOutputs.length > 0) {
                    finalChatOutputs.push('\n\n')
                  }
                  finalChatOutputs.push(stringifiedContent)
                  addedFinalChatValues.add(stringifiedContent)
                }
              }

              // Add to selectedOutputs (only non-streamed content for executionResult.output.content)
              // Only add if we got a valid value and it's not a duplicate
              // Skip if content was streamed (to prevent duplication)
              if (
                extractedContent &&
                typeof extractedContent === 'string' &&
                extractedContent.trim().length > 0
              ) {
                // Check if this exact content value was already added (prevent duplicates)
                if (!addedContentValues.has(extractedContent)) {
                  // Add separator if not the first output
                  if (selectedOutputs.length > 0) {
                    selectedOutputs.push('\n\n')
                  }
                  selectedOutputs.push(extractedContent)
                  addedContentValues.add(extractedContent)
                  processedOutputIds.add(outputId)
                }
              } else if (extractedContent) {
                // For non-string values (like JSON objects), check stringified version
                const stringifiedContent = JSON.stringify(extractedContent, null, 2)
                if (!addedContentValues.has(stringifiedContent)) {
                  if (selectedOutputs.length > 0) {
                    selectedOutputs.push('\n\n')
                  }
                  selectedOutputs.push(stringifiedContent)
                  addedContentValues.add(stringifiedContent)
                  processedOutputIds.add(outputId)
                }
              } else {
                // Mark as processed even if we didn't add content (e.g., streamed content)
                processedOutputIds.add(outputId)
              }

              // Aggregate tokens, tool calls, and files (only count once per block)
              // Check if we've already processed this block for aggregation
              if (!processedBlocks.has(blockIdForOutput)) {
                // Aggregate tokens from selected blocks
                if (log.output.tokens) {
                  aggregatedTokens.prompt += log.output.tokens.prompt || 0
                  aggregatedTokens.completion += log.output.tokens.completion || 0
                  aggregatedTokens.total += log.output.tokens.total || 0
                }

                // Aggregate tool calls
                if (log.output.toolCalls?.list && Array.isArray(log.output.toolCalls.list)) {
                  aggregatedToolCalls.push(...log.output.toolCalls.list)
                }

                // Aggregate files
                if (log.output.files && Array.isArray(log.output.files)) {
                  aggregatedFiles.push(...log.output.files)
                }

                // Mark this block as processed for aggregation
                processedBlocks.add(blockIdForOutput)
              }

              // Use model from first selected block (or last if multiple)
              if (log.output.model) {
                aggregatedModel = log.output.model
              }
            }
          })

          // Construct the final output from selected blocks
          if (selectedOutputs.length > 0) {
            executionResult.output = {
              content: selectedOutputs.join(''),
              ...(aggregatedTokens.total > 0 && { tokens: aggregatedTokens }),
              ...(aggregatedToolCalls.length > 0 && {
                toolCalls: {
                  list: aggregatedToolCalls,
                  count: aggregatedToolCalls.length,
                },
              }),
              ...(aggregatedModel && { model: aggregatedModel }),
              ...(aggregatedFiles.length > 0 && { files: aggregatedFiles }),
            }

            logger.debug(
              `[${requestId}] Constructed executionResult.output from ${selectedOutputIds.length} selected blocks`
            )
          } else {
            // If no content was extracted, set output to empty to avoid showing wrong content
            executionResult.output = {
              content: '',
              ...(aggregatedTokens.total > 0 && { tokens: aggregatedTokens }),
              ...(aggregatedToolCalls.length > 0 && {
                toolCalls: {
                  list: aggregatedToolCalls,
                  count: aggregatedToolCalls.length,
                },
              }),
              ...(aggregatedModel && { model: aggregatedModel }),
            }
            logger.debug(
              `[${requestId}] No content extracted from selected blocks, setting empty output`
            )
          }

          // Clear content from non-selected blocks to prevent UI from displaying them
          // The UI iterates through logs and displays any log with output.content
          // So we need to remove content from non-selected blocks
          executionResult.logs.forEach((log: BlockLog) => {
            const blockIdForLog = log.blockId
            const isSelected = selectedOutputIds.some((outputId) => {
              const blockIdForOutput = extractBlockIdFromOutputId(outputId)
              return blockIdForOutput === blockIdForLog
            })

            // If this block is not selected, clear its content so UI won't display it
            if (!isSelected && log.output && log.output.content !== undefined) {
              // Remove content property from non-selected blocks
              // Preserve other output fields (tokens, model, etc.) for logging
              // This ensures logging still works but UI won't display the content
              const { content, ...outputWithoutContent } = log.output
              log.output = outputWithoutContent
            }
          })

          logger.debug(
            `[${requestId}] Cleared content from non-selected blocks to prevent UI display`
          )
        }
        // If selectedOutputIds.length === 0, keep the original executionResult.output (last block's output)

        const { traceSpans, totalDuration } = buildTraceSpans(executionResult)
        enrichedResult = { ...executionResult, traceSpans, totalDuration }
        if (conversationId) {
          if (!enrichedResult.metadata) {
            enrichedResult.metadata = {
              duration: totalDuration,
              startTime: new Date().toISOString(),
            }
          }
          ;(enrichedResult.metadata as any).conversationId = conversationId
        }

        if (executionResult.success) {
          try {
            await db
              .update(userStats)
              .set({
                totalChatExecutions: sql`total_chat_executions + 1`,
                lastActive: new Date(),
              })
              .where(eq(userStats.userId, deployment.userId))
            logger.debug(`Updated user stats for deployed chat: ${deployment.userId}`)
          } catch (error) {
            logger.error(`Failed to update user stats for deployed chat:`, error)
          }
        }
      } else {
        // If no logs, still build traceSpans and enrichedResult for consistency
        const { traceSpans, totalDuration } = buildTraceSpans(executionResult)
        enrichedResult = { ...executionResult, traceSpans, totalDuration }
        if (conversationId) {
          if (!enrichedResult.metadata) {
            enrichedResult.metadata = {
              duration: totalDuration,
              startTime: new Date().toISOString(),
            }
          }
          ;(enrichedResult.metadata as any).conversationId = conversationId
        }
      }

      // Store the final chat output for history API
      // This should include ALL selected outputs (both streamed and non-streamed)
      // Use finalChatOutputs if available, otherwise fall back to executionResult.output.content
      let finalChatOutput: string | undefined
      if (
        selectedOutputIds.length > 0 &&
        Array.isArray(finalChatOutputs) &&
        finalChatOutputs.length > 0
      ) {
        // Use finalChatOutputs which includes all selected outputs
        finalChatOutput = finalChatOutputs.join('')
      } else if (executionResult.output?.content) {
        // Fallback: if finalChatOutputs is empty or no output_configs, use executionResult.output.content
        finalChatOutput = executionResult.output.content
      }

      const executionId = uuidv4()
      logger.debug(`Generated execution ID for deployed chat: ${executionId}`)

      // Always send the final event with executionResult (whether streaming or not)
      // This ensures the UI receives the complete execution data including metadata and logs
      const finalPayload = {
        event: 'final',
        data: {
          ...enrichedResult,
          executionId,
        },
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalPayload)}\n\n`))

      // Complete logging session (for both success and failure)
      if (executionResult?.logs) {
        const { traceSpans } = buildTraceSpans(executionResult)
        await loggingSession.safeComplete({
          endedAt: new Date().toISOString(),
          totalDurationMs: executionResult.metadata?.duration || 0,
          finalOutput: executionResult.output,
          traceSpans,
          finalChatOutput,
        })
      }

      // Store input and output in deployed_chat_history table
      if (logChatId && finalWorkflowId) {
        try {
          const historyId = uuidv4()
          const now = new Date()

          await db.insert(deployedChatHistory).values({
            id: historyId,
            createdAt: now,
            updatedAt: now,
            chatId: logChatId,
            workflowId: finalWorkflowId,
            input: input,
            output: finalChatOutput || null,
            userId: executingUserId || null,
          })

          logger.debug(`[${requestId}] Stored chat history:`, {
            id: historyId,
            chatId: logChatId,
            workflowId: finalWorkflowId,
            userId: executingUserId,
            hasInput: !!input,
            hasOutput: !!finalChatOutput,
          })
        } catch (error: any) {
          // Log error but don't fail the request
          logger.error(`[${requestId}] Error storing chat history:`, error)
        }
      }

      controller.close()
    },
  })

  return stream
}
