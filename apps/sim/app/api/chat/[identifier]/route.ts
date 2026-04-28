import { db } from '@sim/db'
import {
  chat,
  deployedChat,
  workflow,
  workflowExecutionLogs,
  workflowQueries,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import {
  toPersistedChatAttachment,
  updateExecutionHistoryData,
} from '@/lib/chat/history-persistence'
import { extractGeneratedImagesFromData } from '@/lib/chat/assistant-assets'
import { addCorsHeaders, validateAuthToken } from '@/lib/core/security/deployment'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { preprocessExecution } from '@/lib/execution/preprocessing'
import { LoggingSession } from '@/lib/logs/execution/logging-session'
import { ChatFiles } from '@/lib/uploads'
import { executeWorkflow } from '@/lib/workflows/executor/execute-workflow'
import { loadDeployedWorkflowState } from '@/lib/workflows/persistence/utils'
import type { InputFormatField } from '@/lib/workflows/types'
import { getWorkspaceIdsForUser } from '@/lib/workspaces/permissions/utils'
import { setChatAuthCookie, validateChatAuth } from '@/app/api/chat/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('ChatIdentifierAPI')

const agentDepartments = [
  { value: 'creative', label: 'Creative' },
  { value: 'ma', label: 'MA' },
  { value: 'ppc', label: 'PPC' },
  { value: 'sales', label: 'Sales' },
  { value: 'seo', label: 'SEO' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'waas', label: 'WAAS' },
  { value: 'hr', label: 'HR' },
] as const

const departmentLabelMap: Record<string, string> = agentDepartments.reduce(
  (acc, dept) => {
    acc[dept.value] = dept.label
    return acc
  },
  {} as Record<string, string>
)

function isRenderableImageUrlString(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false

  return (
    (trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('/api/files/serve/')) &&
    (/\.(png|jpg|jpeg|gif|webp)(\?|#|%|$)/i.test(trimmed) ||
      trimmed.includes('agent-generated-images') ||
      trimmed.includes('/api/files/serve/'))
  )
}

function stripImageOnlyStructuredText(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) {
    return ''
  }

  const parseImageUrlArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter(
          (item): item is string => typeof item === 'string' && isRenderableImageUrlString(item)
        )
      : []

  if (trimmed.startsWith('[')) {
    try {
      if (parseImageUrlArray(JSON.parse(trimmed)).length > 0) {
        return ''
      }
    } catch {
      // fall through
    }
  }

  if (trimmed.startsWith('```')) {
    const fencedMatch = trimmed.match(/^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i)
    if (fencedMatch?.[1]) {
      try {
        if (parseImageUrlArray(JSON.parse(fencedMatch[1])).length > 0) {
          return ''
        }
      } catch {
        // fall through
      }
    }
  }

  const nonEmptyLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (nonEmptyLines.length > 0 && nonEmptyLines.every((line) => isRenderableImageUrlString(line))) {
    return ''
  }

  return content
}
interface ChatConfigSource {
  id: string
  title: string
  description: string | null
  customizations: unknown
  authType: string | null
  outputConfigs: unknown
}

function toChatConfigResponse(deployment: ChatConfigSource) {
  return {
    id: deployment.id,
    title: deployment.title,
    description: deployment.description,
    customizations: deployment.customizations,
    authType: deployment.authType,
    outputConfigs: deployment.outputConfigs,
  }
}

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
  chatId: z.string().optional(),
  files: z.array(chatFileSchema).optional().default([]),
  startBlockInputs: z.record(z.unknown()).optional(),
})

const goldenQueriesSchema = z.object({
  goldenQueries: z.array(
    z.object({
      id: z.string().optional(),
      query: z.string().min(1),
    })
  ),
  deleteMode: z.enum(['hard', 'soft']).optional(),
})

const sanitizeGoldenQueries = (queries?: Array<{ id?: string; query: string }>) => {
  if (!Array.isArray(queries)) return []
  return queries
    .map((item) => ({ ...item, query: item.query.trim() }))
    .filter((item) => item.query.length > 0)
}

async function fetchGoldenQueries(workflowId: string) {
  const rows = await db
    .select({ id: workflowQueries.id, query: workflowQueries.query })
    .from(workflowQueries)
    .where(and(eq(workflowQueries.workflowId, workflowId), eq(workflowQueries.deleted, false)))
    .orderBy(asc(workflowQueries.priority), asc(workflowQueries.createdAt))
  return rows
}

async function replaceWorkflowQueries({
  workflowId,
  userId,
  queries,
}: {
  workflowId: string
  userId: string
  queries: Array<{ id?: string; query: string }>
}) {
  await db.transaction(async (tx) => {
    await tx.delete(workflowQueries).where(eq(workflowQueries.workflowId, workflowId))

    if (queries.length === 0) return

    await tx.insert(workflowQueries).values(
      queries.map((item, index) => ({
        id: item.id ?? generateId(),
        userId,
        workflowId,
        query: item.query,
        priority: index,
      }))
    )
  })
}

async function softDeleteWorkflowQueries({
  workflowId,
  keepQueries,
}: {
  workflowId: string
  keepQueries: Array<{ id?: string; query: string }>
}) {
  const keepIds = keepQueries.map((item) => item.id).filter(Boolean) as string[]
  const rows = await db
    .select({ id: workflowQueries.id, query: workflowQueries.query })
    .from(workflowQueries)
    .where(and(eq(workflowQueries.workflowId, workflowId), eq(workflowQueries.deleted, false)))
  const toDeleteIds = rows.filter((row) => !keepIds.includes(row.id)).map((row) => row.id)
  if (toDeleteIds.length === 0) return
  await db
    .update(workflowQueries)
    .set({ deleted: true, updatedAt: new Date() })
    .where(inArray(workflowQueries.id, toDeleteIds))

  await db.transaction(async (tx) => {
    for (const [index, item] of keepQueries.entries()) {
      if (!item.id) continue
      await tx
        .update(workflowQueries)
        .set({ priority: index, updatedAt: new Date() })
        .where(eq(workflowQueries.id, item.id))
    }
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = withRouteHandler(
  async (request: NextRequest, { params }: { params: Promise<{ identifier: string }> }) => {
    const { identifier } = await params
    const requestId = generateRequestId()

    try {
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
          title: chat.title,
          description: chat.description,
          customizations: chat.customizations,
          workflowId: chat.workflowId,
          userId: chat.userId,
          isActive: chat.isActive,
          authType: chat.authType,
          password: chat.password,
          allowedEmails: chat.allowedEmails,
          outputConfigs: chat.outputConfigs,
        })
        .from(chat)
        .where(and(eq(chat.identifier, identifier), isNull(chat.archivedAt)))
        .limit(1)

      if (deploymentResult.length === 0) {
        logger.warn(`[${requestId}] Chat not found for identifier: ${identifier}`)
        return addCorsHeaders(createErrorResponse('Chat not found', 404), request)
      }

      const deployment = deploymentResult[0]

      if (!deployment.isActive) {
        logger.warn(`[${requestId}] Chat is not active: ${identifier}`)

        const [workflowRecord] = await db
          .select({ workspaceId: workflow.workspaceId })
          .from(workflow)
          .where(and(eq(workflow.id, deployment.workflowId), isNull(workflow.archivedAt)))
          .limit(1)

        const workspaceId = workflowRecord?.workspaceId
        if (!workspaceId) {
          logger.warn(
            `[${requestId}] Cannot log: workflow ${deployment.workflowId} has no workspace`
          )
          return addCorsHeaders(
            createErrorResponse('This chat is currently unavailable', 403),
            request
          )
        }

        const executionId = generateId()
        const loggingSession = new LoggingSession(
          deployment.workflowId,
          executionId,
          'chat',
          requestId
        )

        await loggingSession.safeStart({
          userId: deployment.userId,
          workspaceId,
          variables: {},
        })

        await loggingSession.safeCompleteWithError({
          error: {
            message: 'This chat is currently unavailable. The chat has been disabled.',
            stackTrace: undefined,
          },
          traceSpans: [],
        })

        return addCorsHeaders(
          createErrorResponse('This chat is currently unavailable', 403),
          request
        )
      }

      const authResult = await validateChatAuth(requestId, deployment, request, parsedBody)
      if (!authResult.authorized) {
        return addCorsHeaders(
          createErrorResponse(authResult.error || 'Authentication required', 401),
          request
        )
      }

    if (parsedBody.chatId) {
      try {
        const chatId = parsedBody.chatId
        logger.debug(`[${requestId}] Processing chatId: ${chatId}`)

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

        const existingChat = await db
          .select({ id: deployedChat.id })
          .from(deployedChat)
          .where(eq(deployedChat.chatId, chatId))
          .limit(1)

        if (existingChat.length > 0) {
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
          const startBlockValues =
            parsedBody.startBlockInputs && typeof parsedBody.startBlockInputs === 'object'
              ? Object.values(parsedBody.startBlockInputs)
                  .filter((value) => value !== undefined && value !== null)
                  .map((value) => {
                    const stringValue =
                      typeof value === 'string' ? value.trim() : `${value}`.trim()
                    return stringValue
                  })
                  .filter((value) => value.length > 0)
              : []

            const words = parsedBody.input?.trim().split(/\s+/).filter(Boolean) || []
            const title =
              startBlockValues.length > 0
                ? startBlockValues.join(', ')
                : words.slice(0, 5).join(' ') || 'New Chat'

            const deployedChatId = generateId()
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
            if (
              insertError?.code === '23505' ||
              (insertError instanceof Error && insertError.message.includes('unique'))
            ) {
              logger.debug(
                `[${requestId}] Race condition detected - chatId was created by another request: ${chatId}`
              )

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
              throw insertError
            }
          }
        }
      } catch (error: any) {
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

    const session = await getSession()
    const userId = session?.user?.id || null

      if ((password || email) && !input) {
        const response = addCorsHeaders(createSuccessResponse({ authenticated: true }), request)

        setChatAuthCookie(response, deployment.id, deployment.authType, deployment.password)

        return response
      }

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

      const executionId = generateId()

      const loggingSession = new LoggingSession(
        deployment.workflowId,
        executionId,
        'chat',
        requestId
      )

      const preprocessResult = await preprocessExecution({
        workflowId: deployment.workflowId,
        userId: deployment.userId,
        triggerType: 'chat',
        executionId,
        requestId,
        checkRateLimit: true,
        checkDeployment: true,
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
      const workspaceId = workflowRecord?.workspaceId
      if (!workspaceId) {
        logger.error(`[${requestId}] Workflow ${deployment.workflowId} has no workspaceId`)
        return addCorsHeaders(
          createErrorResponse('Workflow has no associated workspace', 500),
          request
        )
      }

    let formattedInitialInput = input || ''
    if (startBlockInputs && typeof startBlockInputs === 'object') {
      const startBlockInputLines: string[] = []
      for (const [key, value] of Object.entries(startBlockInputs)) {
        if (key === 'input' || key === 'conversationId' || key === 'files') {
          continue
        }
        if (value !== null && value !== undefined && value !== '') {
          const formattedValue = typeof value === 'string' ? value : String(value)
          startBlockInputLines.push(`${key}: ${formattedValue}`)
        }
      }
      if (startBlockInputLines.length > 0) {
        const startBlockInputsFormatted = startBlockInputLines.join('\n')
        formattedInitialInput = formattedInitialInput
          ? `${formattedInitialInput}\n${startBlockInputsFormatted}`
          : startBlockInputsFormatted
      }
    }

    await loggingSession.safeStart({
      userId: userId || workspaceOwnerId,
      workspaceId,
      variables: {},
      isExternalChat: true,
      chatId: payload || conversationId || undefined,
      conversationId: conversationId || undefined,
      initialInput: formattedInitialInput || undefined,
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
        const { executeWorkflow } = await import('@/lib/workflows/executor/execute-workflow')
        const { SSE_HEADERS } = await import('@/lib/core/utils/sse')

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
            await updateExecutionHistoryData(executionId, {
              userAttachments: uploadedFiles.map(toPersistedChatAttachment),
            })
            logger.info(`[${requestId}] Successfully processed ${uploadedFiles.length} files`)
          }
        } catch (fileError: any) {
          logger.error(`[${requestId}] Failed to process chat files:`, fileError)

            await loggingSession.safeStart({
              userId: workspaceOwnerId,
              workspaceId,
              variables: {},
              conversationId: undefined,
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
          variables: (workflowRecord?.variables as Record<string, unknown>) ?? undefined,
        }

        const originalStream = await createStreamingResponse({
          requestId,
          streamConfig: {
            selectedOutputs,
            isSecureMode: true,
            workflowTriggerType: 'chat',
            sessionUserId: userId ?? undefined,
          },
          executionId,
          executeFn: async ({ onStream, onBlockComplete, abortSignal, sessionUserId }) =>
            executeWorkflow(
              workflowForExecution,
              requestId,
              workflowInput,
              workspaceOwnerId,
              {
                enabled: true,
                selectedOutputs,
                isSecureMode: true,
                workflowTriggerType: 'chat',
                onStream,
                onBlockComplete,
                skipLoggingComplete: true,
                sessionUserId: sessionUserId ?? undefined,
                abortSignal,
                executionMode: 'stream',
              },
              executionId
            ),
        })

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

              const chunk = decoder.decode(value, { stream: true })
              buffer += chunk

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

                  if (contentChunk) {
                    accumulatedContent += contentChunk
                  }

                  if (event === 'final' && eventData) {
                    const finalData = eventData as {
                      success: boolean
                      error?: string | { message?: string }
                      output?: Record<string, Record<string, any>>
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

                    const isKnowledgeResultsArray = (
                      value: unknown
                    ): value is Array<Record<string, unknown>> =>
                      Array.isArray(value) &&
                      value.length > 0 &&
                      value.every(
                        (item) =>
                          item &&
                          typeof item === 'object' &&
                          'documentId' in item &&
                          'documentName' in item &&
                          'content' in item &&
                          'chunkIndex' in item
                      )

                      const mapToKnowledgePayload = (value: Array<Record<string, unknown>>) =>
                        value.map((item) => ({
                          documentId: String(item.documentId),
                          documentName: String(item.documentName ?? item.documentId),
                          content: String(item.content),
                          chunkIndex: Number(item.chunkIndex),
                          ...(item.metadata && typeof item.metadata === 'object'
                            ? { metadata: item.metadata as Record<string, unknown> }
                            : {}),
                          ...(typeof item.similarity === 'number'
                            ? { similarity: item.similarity }
                            : {}),
                          ...(item.chunkId != null ? { chunkId: String(item.chunkId) } : {}),
                          ...(item.knowledgeBaseId != null
                            ? { knowledgeBaseId: String(item.knowledgeBaseId) }
                            : {}),
                          ...(item.workspaceId != null
                            ? {
                                workspaceId:
                                  item.workspaceId === null ? null : String(item.workspaceId),
                              }
                            : {}),
                        }))

                      let knowledgeResultsPayload: Array<{
                        documentId: string
                        documentName: string
                        content: string
                        chunkIndex: number
                        metadata?: Record<string, unknown>
                        similarity?: number
                        chunkId?: string
                        knowledgeBaseId?: string
                        workspaceId?: string | null
                      }> = []

                      if (finalData.output) {
                        const fromOutputConfig =
                          deployment.outputConfigs &&
                          Array.isArray(deployment.outputConfigs) &&
                          (() => {
                            const aggregated: Array<{
                              documentId: string
                              documentName: string
                              content: string
                              chunkIndex: number
                              metadata?: Record<string, unknown>
                              similarity?: number
                              chunkId?: string
                              knowledgeBaseId?: string
                              workspaceId?: string | null
                            }> = []
                            for (const config of deployment.outputConfigs) {
                              if (config.path === 'results') {
                                const blockOutputs = finalData.output[config.blockId]
                                if (!blockOutputs) continue
                                const value = getOutputValue(blockOutputs, config.path)
                                if (isKnowledgeResultsArray(value)) {
                                  aggregated.push(...mapToKnowledgePayload(value))
                                }
                              }
                            }
                            return aggregated.length > 0 ? aggregated : null
                          })()

                        if (Array.isArray(fromOutputConfig) && fromOutputConfig.length > 0) {
                          knowledgeResultsPayload = fromOutputConfig
                        } else {
                          for (const blockOutputs of Object.values(finalData.output)) {
                            if (!blockOutputs || typeof blockOutputs !== 'object') continue
                            const value = getOutputValue(blockOutputs, 'results')
                            if (isKnowledgeResultsArray(value)) {
                              knowledgeResultsPayload.push(...mapToKnowledgePayload(value))
                            }
                          }
                        }
                      }

                      if (knowledgeResultsPayload.length > 0) {
                        const knowledgeResultsEvent = JSON.stringify({
                          event: 'knowledgeResults',
                          data: knowledgeResultsPayload,
                        })
                        controller.enqueue(encoder.encode(`data: ${knowledgeResultsEvent}\n\n`))
                      }

                    const generatedImages = finalData.output
                      ? extractGeneratedImagesFromData(finalData.output)
                      : []

                    const knowledgeRefs =
                      knowledgeResultsPayload.length > 0
                        ? (() => {
                            const refs: Array<{
                              documentId: string
                              documentName: string
                              chunkId: string
                              chunkIndex: number
                              knowledgeBaseId: string
                              workspaceId: string | null
                            }> = []
                            for (const item of knowledgeResultsPayload) {
                              if (
                                item.chunkId != null &&
                                item.knowledgeBaseId != null &&
                                item.workspaceId !== undefined &&
                                typeof item.chunkIndex === 'number'
                              ) {
                                refs.push({
                                  documentId: item.documentId,
                                  documentName: item.documentName || item.documentId,
                                  chunkId: String(item.chunkId),
                                  chunkIndex: item.chunkIndex,
                                  knowledgeBaseId: String(item.knowledgeBaseId),
                                  workspaceId:
                                    item.workspaceId === null ? null : String(item.workspaceId),
                                })
                              }
                            }
                            return refs
                          })()
                        : []

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
                        if (extractGeneratedImagesFromData(value).length > 0) {
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

                        const formattedOutputs: string[] = []
                        for (const config of deployment.outputConfigs) {
                          const blockOutputs = finalData.output[config.blockId]
                          if (!blockOutputs) continue

                          const value = getOutputValue(blockOutputs, config.path)
                          if (config.path === 'results' && isKnowledgeResultsArray(value)) {
                            continue
                          }
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

                    if (generatedImages.length > 0) {
                      finalChatOutput = stripImageOnlyStructuredText(finalChatOutput)
                    }

                    if (finalChatOutput || knowledgeRefs.length > 0 || generatedImages.length > 0) {
                      try {
                        if (finalChatOutput) {
                          await db
                            .update(workflowExecutionLogs)
                            .set({ finalChatOutput })
                            .where(eq(workflowExecutionLogs.executionId, executionId))
                        }
                        if (knowledgeRefs.length > 0 || generatedImages.length > 0) {
                          await updateExecutionHistoryData(executionId, {
                            knowledgeRefs,
                            generatedImages,
                          })
                        }
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

                  controller.enqueue(encoder.encode(`${line}\n\n`))
                } catch {
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
)

export const PATCH = withRouteHandler(
  async (request: NextRequest, { params }: { params: Promise<{ identifier: string }> }) => {
    const { identifier } = await params
    const requestId = generateRequestId()

    try {
      let parsedBody
      try {
        const rawBody = await request.json()
        const validation = goldenQueriesSchema.safeParse(rawBody)
        if (!validation.success) {
          const errorMessage = validation.error.errors
            .map((err) => `${err.path.join('.')}: ${err.message}`)
            .join(', ')
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
          isActive: chat.isActive,
          authType: chat.authType,
          password: chat.password,
          allowedEmails: chat.allowedEmails,
          workflowId: chat.workflowId,
          userId: chat.userId,
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
        return addCorsHeaders(
          createErrorResponse('This chat is currently unavailable', 403),
          request
        )
      }

      const cookieName = `chat_auth_${deployment.id}`
      const authCookie = request.cookies.get(cookieName)
      if (
        deployment.authType !== 'public' &&
        (!authCookie || !validateAuthToken(authCookie.value, deployment.id, deployment.password))
      ) {
        const authResult = await validateChatAuth(requestId, deployment, request)
        if (!authResult.authorized) {
          return addCorsHeaders(
            createErrorResponse(authResult.error || 'Authentication required', 401),
            request
          )
        }
      }

      const sanitizedQueries = sanitizeGoldenQueries(parsedBody.goldenQueries)
      const deleteMode = parsedBody.deleteMode ?? 'hard'

      if (deleteMode === 'soft') {
        await softDeleteWorkflowQueries({
          workflowId: deployment.workflowId,
          keepQueries: sanitizedQueries,
        })
      } else {
        await replaceWorkflowQueries({
          workflowId: deployment.workflowId,
          userId: deployment.userId,
          queries: sanitizedQueries,
        })
      }

      await db.update(chat).set({ updatedAt: new Date() }).where(eq(chat.id, deployment.id))

      return addCorsHeaders(createSuccessResponse({ goldenQueries: sanitizedQueries }), request)
    } catch (error: any) {
      logger.error(`[${requestId}] Error updating golden queries:`, error)
      return addCorsHeaders(
        createErrorResponse(error.message || 'Failed to update golden queries', 500),
        request
      )
    }
  }
)

export const GET = withRouteHandler(
  async (request: NextRequest, { params }: { params: Promise<{ identifier: string }> }) => {
    const { identifier } = await params
    const requestId = generateRequestId()

    try {
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
          department: chat.department,
        })
        .from(chat)
        .where(and(eq(chat.identifier, identifier), isNull(chat.archivedAt)))
        .limit(1)

      if (deploymentResult.length === 0) {
        logger.warn(`[${requestId}] Chat not found for identifier: ${identifier}`)
        return addCorsHeaders(createErrorResponse('Chat not found', 404), request)
      }

      const deployment = deploymentResult[0]

      if (!deployment.isActive) {
        logger.warn(`[${requestId}] Chat is not active: ${identifier}`)
        return addCorsHeaders(
          createErrorResponse('This chat is currently unavailable', 403),
          request
        )
      }

      // Extract Start Block inputFormat for chat UI (before auth checks so it's available in all responses)
      let inputFormat: InputFormatField[] = []
      try {
        const deployedData = (await loadDeployedWorkflowState(
          deployment.workflowId
        )) as unknown as {
          blocks?: Record<string, unknown>
        }
        const blocks = Object.values(deployedData.blocks ?? {}) as Array<Record<string, unknown>>
        const startBlock = blocks.find(
          (block) => block.type === 'start_trigger' || block.type === 'starter'
        ) as { subBlocks?: Record<string, unknown> } | undefined
        const inputFormatValue = (startBlock?.subBlocks as any)?.inputFormat?.value as unknown
        if (inputFormatValue) {
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
      const goldenQueries = await fetchGoldenQueries(deployment.workflowId)

      /**
       * Helper function to build chat config response with inputFormat always included.
       * When userWorkspaceIds is provided (logged-in user with workspace access), KB "View in Knowledge Base" links are shown.
       */
      const buildChatConfigResponse = (userWorkspaceIds?: string[]) => {
        const departmentValue = deployment.department ?? null
        const departmentLabel =
          departmentValue != null ? (departmentLabelMap[departmentValue] ?? departmentValue) : null

        return createSuccessResponse({
          id: deployment.id,
          title: deployment.title,
          description: deployment.description,
          customizations: {
            ...(deployment.customizations ?? {}),
            goldenQueries,
          },
          authType: deployment.authType,
          outputConfigs: deployment.outputConfigs,
          inputFormat, // Always included in successful responses
          department: departmentLabel, // Department in label format
          ...(userWorkspaceIds && userWorkspaceIds.length > 0 && { userWorkspaceIds }),
        })
      }

      const cookieName = `chat_auth_${deployment.id}`
      const authCookie = request.cookies.get(cookieName)

      if (
        deployment.authType !== 'public' &&
        authCookie &&
        validateAuthToken(authCookie.value, deployment.id, deployment.password)
      ) {
        let userWorkspaceIds: string[] | undefined
        try {
          const session = await getSession()
          if (session?.user?.id) {
            userWorkspaceIds = await getWorkspaceIdsForUser(session.user.id)
          }
        } catch {
          // Non-fatal; proceed without userWorkspaceIds
        }
        return addCorsHeaders(buildChatConfigResponse(userWorkspaceIds), request)
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

      let userWorkspaceIds: string[] | undefined
      try {
        const session = await getSession()
        if (session?.user?.id) {
          userWorkspaceIds = await getWorkspaceIdsForUser(session.user.id)
        }
      } catch {
        // Non-fatal; proceed without userWorkspaceIds
      }

      const response = buildChatConfigResponse(userWorkspaceIds)

      if (deployment.authType !== 'public') {
        setChatAuthCookie(response, deployment.id, deployment.authType)
      }

      return addCorsHeaders(response, request)
    } catch (error: any) {
      logger.error(`[${requestId}] Error fetching chat info:`, error)
      return addCorsHeaders(
        createErrorResponse(error.message || 'Failed to fetch chat information', 500),
        request
      )
    }
  }
)
