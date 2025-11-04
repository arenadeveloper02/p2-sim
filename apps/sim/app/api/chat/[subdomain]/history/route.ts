import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { addCorsHeaders } from '@/app/api/chat/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'
import { db } from '@/db'
import { chat, chatPromptFeedback, workflowExecutionLogs } from '@/db/schema'

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
 * - chatId: Filter by specific chat ID (chat_id column in workflow_execution_logs)
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
    const chatId = searchParams.get('chatId')
    const level = searchParams.get('level') // 'info' or 'error'

    logger.debug(
      `[${requestId}] Start date: ${startDate}, End date: ${endDate}, Conversation ID: ${conversationId}, Chat ID: ${chatId}, Level: ${level}`
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

    // Require authenticated user and use their id to filter records
    const session = await getSession()
    const executingUserId = session?.user?.id
    if (!executingUserId) {
      logger.info(`[${requestId}] Unauthorized request for history: missing session user`)
      return addCorsHeaders(createErrorResponse('Authentication required', 401), request)
    }

    // Build query conditions for external chat logs
    let conditions = and(
      eq(workflowExecutionLogs.workflowId, subdomain),
      eq(workflowExecutionLogs.isExternalChat, true), // Only external chat logs
      eq(workflowExecutionLogs.userId, executingUserId) // Filter by executing user
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

    // Add chatId filter if provided
    if (chatId) {
      conditions = and(conditions, eq(workflowExecutionLogs.chatId, chatId))
    }

    // Add conversation ID filter if provided (search in executionData)
    // if (conversationId) {
    //   conditions = and(conditions, sql`${workflowExecutionLogs.executionData}->>'conversationId' = ${conversationId}`)
    // }

    // Log the conditions in a safe way (avoid circular references)
    const conditionsInfo = {
      workflowId: subdomain,
      isExternalChat: true,
      executingUserId,
      startDate: startDate || null,
      endDate: endDate || null,
      level: level || null,
      conversationId: conversationId || null,
      chatId: chatId || null,
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

    // Batch fetch feedback status (liked) for all executionIds in this page
    const executionIds = logs.map((l) => l.executionId)
    let likedByExecutionId = new Map<string, boolean>()
    if (executionIds.length > 0) {
      // Aggregate to a single boolean per executionId for efficiency
      const feedbackRows = await db
        .select({
          executionId: chatPromptFeedback.executionId,
          liked: sql<boolean>`bool_or(${chatPromptFeedback.liked})`,
        })
        .from(chatPromptFeedback)
        .where(inArray(chatPromptFeedback.executionId, executionIds))
        .groupBy(chatPromptFeedback.executionId)

      likedByExecutionId = new Map(feedbackRows.map((r) => [r.executionId, !!r.liked]))
    }

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: sql`count(*)` })
      .from(workflowExecutionLogs)
      .where(conditions)

    const totalCount = totalCountResult[0]?.count || 0

    // Get chat deployment to access output_configs
    const deploymentResult = await db
      .select({
        outputConfigs: chat.outputConfigs,
      })
      .from(chat)
      .where(eq(chat.subdomain, subdomain))
      .limit(1)

    const deployment = deploymentResult[0]
    const outputConfigs =
      (deployment?.outputConfigs as Array<{ blockId: string; path: string }>) || []

    // Helper functions to extract block ID and path from outputId (same as in utils.ts)
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
          return output
        }
      }

      return output
    }

    // Format the response data
    const formattedLogs = logs.map((log) => {
      const executionData = log.executionData as any

      // Extract userInput:
      // 1. First check traceSpans.initialInput
      // 2. If null, check traceSpans.spans -> workflow -> children -> agent -> input.userPrompt
      let userInput = null
      let conversationId = null

      if (executionData?.traceSpans) {
        // Check for initialInput first
        if (
          executionData.traceSpans.initialInput &&
          typeof executionData.traceSpans.initialInput === 'string'
        ) {
          userInput = executionData.traceSpans.initialInput
        } else if (
          executionData.traceSpans.spans &&
          Array.isArray(executionData.traceSpans.spans)
        ) {
          // Look for workflow execution span in spans array
          const workflowSpan = executionData.traceSpans.spans.find(
            (span: any) => span.type === 'workflow'
          )
          if (workflowSpan?.children && Array.isArray(workflowSpan.children)) {
            // Look for agent spans in children
            const agentSpans = workflowSpan.children.filter((child: any) => child.type === 'agent')
            if (agentSpans.length > 0) {
              const agentSpan = agentSpans[0] // Get first agent span
              userInput = agentSpan.input?.userPrompt || null
              conversationId = agentSpan.input?.conversationId || null
            }
          }
        } else if (Array.isArray(executionData.traceSpans)) {
          // Fallback: if traceSpans is directly an array (old format)
          const workflowSpan = executionData.traceSpans.find(
            (span: any) => span.type === 'workflow'
          )
          if (workflowSpan?.children && Array.isArray(workflowSpan.children)) {
            const agentSpans = workflowSpan.children.filter((child: any) => child.type === 'agent')
            if (agentSpans.length > 0) {
              const agentSpan = agentSpans[0]
              userInput = agentSpan.input?.userPrompt || null
              conversationId = agentSpan.input?.conversationId || null
            }
          }
        }
      }

      // Extract modelOutput based on output_configs
      let modelOutput = null

      if (outputConfigs.length > 0) {
        // Extract selectedOutputIds from outputConfigs (same format as in utils.ts)
        const selectedOutputIds = outputConfigs.map((config) => {
          return config.path ? `${config.blockId}_${config.path}` : `${config.blockId}.content`
        })

        const selectedOutputs: string[] = []

        // Get blocks from traceSpans.spans (database format)
        // The execution_data in DB has traceSpans.spans array with workflow span containing children
        let blocks: any[] = []
        if (executionData?.traceSpans?.spans && Array.isArray(executionData.traceSpans.spans)) {
          const workflowSpan = executionData.traceSpans.spans.find(
            (span: any) => span.type === 'workflow'
          )
          if (workflowSpan?.children && Array.isArray(workflowSpan.children)) {
            blocks = workflowSpan.children
          }
        } else if (Array.isArray(executionData?.traceSpans)) {
          // Fallback: old format where traceSpans is directly an array
          const workflowSpan = executionData.traceSpans.find(
            (span: any) => span.type === 'workflow'
          )
          if (workflowSpan?.children && Array.isArray(workflowSpan.children)) {
            blocks = workflowSpan.children
          }
        }

        // Also check executionData.logs if available (for newer format)
        const logs = executionData?.logs || []
        const finalOutput = executionData?.finalOutput || executionData?.output || {}

        // Extract outputs from selected blocks
        selectedOutputIds.forEach((outputId) => {
          const blockIdForOutput = extractBlockIdFromOutputId(outputId)
          const path = extractPathFromOutputId(outputId, blockIdForOutput)

          let outputValue: any

          // First try to find in blocks (from traceSpans.spans)
          const block = blocks.find((b: any) => b.blockId === blockIdForOutput)
          if (block && block.output) {
            let blockOutput = block.output

            if (path && path !== 'content') {
              // Extract specific path (e.g., "model", "tokens", etc.)
              const pathParts = path.split('.')
              for (const part of pathParts) {
                if (blockOutput && typeof blockOutput === 'object' && part in blockOutput) {
                  blockOutput = blockOutput[part]
                } else {
                  blockOutput = undefined
                  break
                }
              }
              outputValue = blockOutput
            } else {
              // Default to content field
              outputValue = blockOutput.content
            }
          } else {
            // Try to find in logs (for newer format)
            const log = logs.find((l: any) => l.blockId === blockIdForOutput)
            if (log && log.output) {
              let logOutput = log.output

              if (path && path !== 'content') {
                const pathParts = path.split('.')
                for (const part of pathParts) {
                  if (logOutput && typeof logOutput === 'object' && part in logOutput) {
                    logOutput = logOutput[part]
                  } else {
                    logOutput = undefined
                    break
                  }
                }
                outputValue = logOutput
              } else {
                outputValue = logOutput.content
              }
            } else if (finalOutput && Object.keys(finalOutput).length > 0) {
              // Fallback to finalOutput if block/log not found
              let finalOutputValue = finalOutput

              if (path && path !== 'content') {
                const pathParts = path.split('.')
                for (const part of pathParts) {
                  if (
                    finalOutputValue &&
                    typeof finalOutputValue === 'object' &&
                    part in finalOutputValue
                  ) {
                    finalOutputValue = finalOutputValue[part]
                  } else {
                    finalOutputValue = undefined
                    break
                  }
                }
                outputValue = finalOutputValue
              } else {
                outputValue = finalOutput.content
              }
            }
          }

          if (outputValue !== undefined && outputValue !== null) {
            const formattedOutput =
              typeof outputValue === 'string' ? outputValue : JSON.stringify(outputValue, null, 2)
            if (selectedOutputs.length > 0) {
              selectedOutputs.push('\n\n')
            }
            selectedOutputs.push(formattedOutput)
          }
        })

        if (selectedOutputs.length > 0) {
          modelOutput = selectedOutputs.join('')
        }
      } else {
        // Fallback: if no output_configs, use finalOutput.content or first agent span output
        if (executionData?.finalOutput?.content) {
          modelOutput = executionData.finalOutput.content
        } else if (executionData?.output?.content) {
          modelOutput = executionData.output.content
        } else if (executionData?.traceSpans) {
          // Try to get from traceSpans (backward compatibility)
          if (executionData.traceSpans.spans && Array.isArray(executionData.traceSpans.spans)) {
            const workflowSpan = executionData.traceSpans.spans.find(
              (span: any) => span.type === 'workflow'
            )
            if (workflowSpan?.children) {
              const agentSpans = workflowSpan.children.filter(
                (child: any) => child.type === 'agent'
              )
              if (agentSpans.length > 0) {
                modelOutput = agentSpans[0].output?.content || null
              }
            }
          } else if (Array.isArray(executionData.traceSpans)) {
            const workflowSpan = executionData.traceSpans.find(
              (span: any) => span.type === 'workflow'
            )
            if (workflowSpan?.children) {
              const agentSpans = workflowSpan.children.filter(
                (child: any) => child.type === 'agent'
              )
              if (agentSpans.length > 0) {
                modelOutput = agentSpans[0].output?.content || null
              }
            }
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
        liked: likedByExecutionId.has(log.executionId)
          ? likedByExecutionId.get(log.executionId)!
          : null,
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
