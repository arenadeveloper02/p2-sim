import { createLogger } from '@sim/logger'
import { createTimeoutAbortController, getTimeoutErrorMessage } from '@/lib/core/execution-limits'
import {
  extractBlockIdFromOutputId,
  extractPathFromOutputId,
  traverseObjectPath,
} from '@/lib/core/utils/response-format'
import { encodeSSE } from '@/lib/core/utils/sse'
import { buildTraceSpans } from '@/lib/logs/execution/trace-spans/trace-spans'
import { processStreamingBlockLogs } from '@/lib/tokenization'
import {
  cleanupExecutionBase64Cache,
  hydrateUserFilesWithBase64,
} from '@/lib/uploads/utils/user-file-base64.server'
import type { BlockLog, ExecutionResult, StreamingExecution } from '@/executor/types'

/**
 * Extended streaming execution type that includes blockId on the execution.
 * The runtime passes blockId but the base StreamingExecution type doesn't declare it.
 */
interface StreamingExecutionWithBlockId extends Omit<StreamingExecution, 'execution'> {
  execution?: StreamingExecution['execution'] & { blockId?: string }
}

const logger = createLogger('WorkflowStreaming')

const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype']

export interface StreamingConfig {
  selectedOutputs?: string[]
  isSecureMode?: boolean
  workflowTriggerType?: 'api' | 'chat'
  includeFileBase64?: boolean
  base64MaxBytes?: number
  timeoutMs?: number
  /** When set (e.g. deployed chat with logged-in user), Arena tools use this user's token from DB. */
  sessionUserId?: string | null
}

export type StreamingExecutorFn = (callbacks: {
  onStream: (streamingExec: StreamingExecution) => Promise<void>
  onBlockComplete: (blockId: string, output: unknown) => Promise<void>
  abortSignal: AbortSignal
  /** Mirrors `streamConfig.sessionUserId` for `executeWorkflow` / Arena token resolution. */
  sessionUserId?: string | null
}) => Promise<ExecutionResult>

export interface StreamingResponseOptions {
  requestId: string
  streamConfig: StreamingConfig
  executionId?: string
  executeFn: StreamingExecutorFn
}

interface StreamingState {
  streamedChunks: Map<string, string[]>
  processedOutputs: Set<string>
  streamedOutputIds: Set<string>
  streamCompletionTimes: Map<string, number>
  streamedContent: Map<string, string>
  completedBlockIds: Set<string>
}

function isRenderableImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }

  if (trimmed.startsWith('data:image/')) {
    return true
  }

  if (trimmed.startsWith('/api/files/serve/')) {
    return (
      /\.(png|jpg|jpeg|gif|webp)(\?|#|%|$)/i.test(trimmed) ||
      trimmed.includes('agent-generated-images')
    )
  }

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return false
  }

  return (
    /\.(png|jpg|jpeg|gif|webp)(\?|#|%|$)/i.test(trimmed) ||
    trimmed.includes('agent-generated-images') ||
    trimmed.includes('/api/files/serve/')
  )
}

function containsRenderableImageOutput(value: unknown): boolean {
  if (!value) {
    return false
  }

  if (isRenderableImageUrl(value)) {
    return true
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsRenderableImageOutput(item))
  }

  if (typeof value === 'object') {
    return Object.values(value).some((item) => containsRenderableImageOutput(item))
  }

  return false
}

function resolveStreamedContent(state: StreamingState): Map<string, string> {
  const result = new Map<string, string>()
  for (const [blockId, chunks] of state.streamedChunks) {
    result.set(blockId, chunks.join(''))
  }
  return result
}

function extractOutputValue(output: unknown, path: string): unknown {
  return traverseObjectPath(output, path)
}

function isDangerousKey(key: string): boolean {
  return DANGEROUS_KEYS.includes(key)
}

/** Knowledge base results (documentId, documentName, content, chunkIndex). Excluded from streamed content; chat shows them as references only. */
function isKnowledgeResultsArray(value: unknown): value is Array<Record<string, unknown>> {
  return (
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
  )
}

async function buildMinimalResult(
  result: ExecutionResult,
  selectedOutputs: string[] | undefined,
  streamedContent: Map<string, string>,
  streamedOutputIds: Set<string>,
  completedBlockIds: Set<string>,
  requestId: string,
  executionId?: string,
  includeFileBase64?: boolean,
  base64MaxBytes?: number | undefined
): Promise<{ success: boolean; error?: string; output: Record<string, unknown> }> {
  const minimalResult = {
    success: result.success,
    error: result.error,
    output: {} as Record<string, any>,
    ...(executionId ? { executionId } : {}),
  }

  // Handle skipped workflows - include skip response in output
  // BUT: if it was already streamed, don't include it again to avoid duplication
  if (result.status === 'skipped' && result.output && typeof result.output === 'object') {
    const skipOutput = result.output as Record<string, any>
    const skipContent = skipOutput.content

    if (skipContent && typeof skipContent === 'string') {
      // Check if skip content was already streamed
      let alreadyStreamed = false
      if (selectedOutputs && selectedOutputs.length > 0) {
        const firstOutputId = selectedOutputs[0]
        const blockId = extractBlockIdFromOutputId(firstOutputId)
        // If this blockId was already streamed, skip including it in final result
        if (streamedContent.has(blockId)) {
          alreadyStreamed = true
          logger.debug(
            `[${requestId}] Skip response already streamed, skipping from final result`,
            {
              executionId,
              blockId,
            }
          )
        }
      }

      // Only include in final result if it wasn't already streamed
      if (!alreadyStreamed) {
        // For skipped workflows, include the skip response in the output
        // Use a special key or the first selected output blockId if available
        if (selectedOutputs && selectedOutputs.length > 0) {
          // Extract blockId from first selected output
          const firstOutputId = selectedOutputs[0]
          const blockId = extractBlockIdFromOutputId(firstOutputId)
          const path = extractPathFromOutputId(firstOutputId, blockId)

          if (!minimalResult.output[blockId]) {
            minimalResult.output[blockId] = Object.create(null) as Record<string, unknown>
          }
          ;(minimalResult.output[blockId] as Record<string, unknown>)[path] = skipContent
        } else {
          // If no selected outputs, include in a default structure
          minimalResult.output = { content: skipContent }
        }

        logger.debug(`[${requestId}] Included skip response in minimal result`, {
          executionId,
          hasContent: !!skipContent,
          contentLength: skipContent.length,
        })
      } else {
        // Even though we checked, ensure the output structure doesn't contain the skip content
        // This is a safety measure to prevent UI from processing it
        if (selectedOutputs && selectedOutputs.length > 0) {
          const firstOutputId = selectedOutputs[0]
          const blockId = extractBlockIdFromOutputId(firstOutputId)
          const path = extractPathFromOutputId(firstOutputId, blockId)

          // Ensure this blockId/path combination is not in the output
          if (minimalResult.output[blockId]) {
            const blockOutput = minimalResult.output[blockId] as Record<string, unknown>
            if (blockOutput[path] === skipContent) {
              blockOutput[path] = undefined
              // If block is now empty, remove it
              if (Object.keys(blockOutput).length === 0) {
                minimalResult.output[blockId] = undefined
              }
            }
          }
        } else if (minimalResult.output.content === skipContent) {
          // Remove content if it matches the skip content
          minimalResult.output.content = undefined
        }
      }

      return minimalResult
    }
  }

  if (result.status === 'paused') {
    minimalResult.output = result.output || {}
    return minimalResult
  }

  if (!selectedOutputs?.length) {
    minimalResult.output = result.output || {}
    return minimalResult
  }

  if (!result.output || !result.logs) {
    return minimalResult
  }

  for (const outputId of selectedOutputs) {
    const blockId = extractBlockIdFromOutputId(outputId)

    if (!completedBlockIds.has(blockId)) {
      continue
    }

    if (isDangerousKey(blockId)) {
      logger.warn(`[${requestId}] Blocked dangerous blockId: ${blockId}`)
      continue
    }

    const path = extractPathFromOutputId(outputId, blockId)
    if (isDangerousKey(path)) {
      logger.warn(`[${requestId}] Blocked dangerous path: ${path}`)
      continue
    }

    if (streamedOutputIds.has(outputId)) {
      continue
    }

    if (streamedContent.has(blockId) && (path === 'content' || path === 'result' || path === '')) {
      continue
    }

    const blockLog = result.logs.find((log: BlockLog) => log.blockId === blockId)
    if (!blockLog?.output) {
      continue
    }

    const value = extractOutputValue(blockLog.output, path)
    if (value === undefined) {
      continue
    }

    if (!minimalResult.output[blockId]) {
      minimalResult.output[blockId] = Object.create(null) as Record<string, unknown>
    }
    ;(minimalResult.output[blockId] as Record<string, unknown>)[path] = value
  }

  return minimalResult
}

function updateLogsWithStreamedContent(
  logs: BlockLog[],
  streamedContent: Map<string, string>,
  streamCompletionTimes: Map<string, number>
): BlockLog[] {
  return logs.map((log: BlockLog) => {
    if (!streamedContent.has(log.blockId)) {
      return log
    }

    const content = streamedContent.get(log.blockId)
    const updatedLog = { ...log }

    if (streamCompletionTimes.has(log.blockId)) {
      const completionTime = streamCompletionTimes.get(log.blockId)!
      const startTime = new Date(log.startedAt).getTime()
      updatedLog.endedAt = new Date(completionTime).toISOString()
      updatedLog.durationMs = completionTime - startTime
    }

    if (log.output && content) {
      updatedLog.output = { ...log.output, content }
    }

    return updatedLog
  })
}

async function completeLoggingSession(result: ExecutionResult): Promise<void> {
  if (!result._streamingMetadata?.loggingSession) {
    return
  }

  const { traceSpans, totalDuration } = buildTraceSpans(result)

  if (result.status === 'skipped') {
    const skipContent =
      result.output && typeof result.output === 'object' && 'content' in result.output
        ? (result.output.content as string)
        : undefined

    await result._streamingMetadata.loggingSession.safeCompleteAsSkipped({
      endedAt: new Date().toISOString(),
      totalDurationMs: totalDuration || 0,
      finalOutput: result.output || {},
      traceSpans: (traceSpans || []) as any,
      workflowInput: result._streamingMetadata.processedInput,
      finalChatOutput: skipContent,
    })
  } else {
    await result._streamingMetadata.loggingSession.safeComplete({
      endedAt: new Date().toISOString(),
      totalDurationMs: totalDuration || 0,
      finalOutput: result.output || {},
      traceSpans: (traceSpans || []) as any,
      workflowInput: result._streamingMetadata.processedInput,
    })
  }

  result._streamingMetadata = undefined
}

export async function createStreamingResponse(
  options: StreamingResponseOptions
): Promise<ReadableStream> {
  const { requestId, streamConfig, executionId, executeFn } = options
  const timeoutController = createTimeoutAbortController(streamConfig.timeoutMs)

  return new ReadableStream({
    async start(controller) {
      const state: StreamingState = {
        streamedChunks: new Map(),
        streamedContent: new Map(),
        processedOutputs: new Set(),
        streamedOutputIds: new Set(),
        streamCompletionTimes: new Map(),
        completedBlockIds: new Set(),
      }

      const sendChunk = (blockId: string, content: string) => {
        const separator = state.processedOutputs.size > 0 ? '\n\n' : ''
        controller.enqueue(encodeSSE({ blockId, chunk: separator + content }))
        state.processedOutputs.add(blockId)
      }

      /**
       * Callback for handling streaming execution events.
       */
      const onStreamCallback = async (streamingExec: StreamingExecutionWithBlockId) => {
        const blockId = streamingExec.execution?.blockId
        if (!blockId) {
          logger.warn(`[${requestId}] Streaming execution missing blockId`)
          return
        }

        const reader = streamingExec.stream.getReader()
        const decoder = new TextDecoder()
        let isFirstChunk = true

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              state.streamCompletionTimes.set(blockId, Date.now())
              break
            }

            const textChunk = decoder.decode(value, { stream: true })
            if (!state.streamedChunks.has(blockId)) {
              state.streamedChunks.set(blockId, [])
            }
            state.streamedChunks.get(blockId)!.push(textChunk)

            if (isFirstChunk) {
              sendChunk(blockId, textChunk)
              isFirstChunk = false
            } else {
              controller.enqueue(encodeSSE({ blockId, chunk: textChunk }))
            }
          }
        } catch (error) {
          logger.error(`[${requestId}] Error reading stream for block ${blockId}:`, error)
          controller.enqueue(
            encodeSSE({
              event: 'stream_error',
              blockId,
              error: error instanceof Error ? error.message : 'Stream reading error',
            })
          )
        }
      }

      const includeFileBase64 = streamConfig.includeFileBase64 ?? true
      const base64MaxBytes = streamConfig.base64MaxBytes

      const onBlockCompleteCallback = async (blockId: string, output: unknown) => {
        state.completedBlockIds.add(blockId)

        if (!streamConfig.selectedOutputs?.length) {
          return
        }

        if (state.streamedChunks.has(blockId)) {
          return
        }

        const matchingOutputs = streamConfig.selectedOutputs.filter(
          (outputId) => extractBlockIdFromOutputId(outputId) === blockId
        )

        for (const outputId of matchingOutputs) {
          const path = extractPathFromOutputId(outputId, blockId)
          const outputValue = extractOutputValue(output, path)

          if (outputValue !== undefined) {
            if (isKnowledgeResultsArray(outputValue)) {
              continue
            }
            const hydratedOutput = includeFileBase64
              ? await hydrateUserFilesWithBase64(outputValue, {
                  requestId,
                  executionId,
                  maxBytes: base64MaxBytes,
                })
              : outputValue

            if (containsRenderableImageOutput(hydratedOutput)) {
              continue
            }

            const formattedOutput =
              typeof hydratedOutput === 'string'
                ? hydratedOutput
                : JSON.stringify(hydratedOutput, null, 2)
            sendChunk(blockId, formattedOutput)
            state.streamedOutputIds.add(outputId)
          }
        }
      }

      try {
        const result = await executeFn({
          onStream: onStreamCallback,
          onBlockComplete: onBlockCompleteCallback,
          abortSignal: timeoutController.signal,
          sessionUserId: streamConfig.sessionUserId,
        })

        // Handle skipped workflows - stream the skip response immediately
        // Mark it as streamed so it won't be included in final result
        if (result.status === 'skipped' && result.output && typeof result.output === 'object') {
          const skipOutput = result.output as Record<string, any>
          const skipContent = skipOutput.content

          if (
            skipContent &&
            typeof skipContent === 'string' &&
            streamConfig.selectedOutputs?.length
          ) {
            // Extract blockId from first selected output to stream to correct block
            const firstOutputId = streamConfig.selectedOutputs[0]
            const blockId = extractBlockIdFromOutputId(firstOutputId)

            // Stream the skip response content immediately
            logger.debug(`[${requestId}] Streaming skip response for skipped workflow`, {
              executionId,
              blockId,
              contentLength: skipContent.length,
            })

            sendChunk(blockId, skipContent)
            // Mark as streamed BEFORE buildMinimalResult is called
            // This ensures buildMinimalResult will skip including it in the final result
            state.streamedContent.set(blockId, skipContent)
          }
        }

        const streamedContent =
          state.streamedChunks.size > 0 ? resolveStreamedContent(state) : new Map<string, string>()

        if (result.logs && streamedContent.size > 0) {
          result.logs = updateLogsWithStreamedContent(
            result.logs,
            streamedContent,
            state.streamCompletionTimes
          )
          processStreamingBlockLogs(result.logs, streamedContent)
        }

        if (
          result.status === 'cancelled' &&
          timeoutController.isTimedOut() &&
          timeoutController.timeoutMs
        ) {
          const timeoutErrorMessage = getTimeoutErrorMessage(null, timeoutController.timeoutMs)
          logger.info(`[${requestId}] Streaming execution timed out`, {
            timeoutMs: timeoutController.timeoutMs,
          })
          if (result._streamingMetadata?.loggingSession) {
            await result._streamingMetadata.loggingSession.markAsFailed(timeoutErrorMessage)
          }
          controller.enqueue(encodeSSE({ event: 'error', error: timeoutErrorMessage }))
        } else {
          await completeLoggingSession(result)

          const minimalResult = await buildMinimalResult(
            result,
            streamConfig.selectedOutputs,
            streamedContent,
            state.streamedOutputIds,
            state.completedBlockIds,
            requestId,
            executionId,
            streamConfig.includeFileBase64 ?? true,
            streamConfig.base64MaxBytes
          )

          controller.enqueue(
            encodeSSE({
              event: 'final',
              data: {
                ...minimalResult,
                ...(result.status === 'paused' && { status: 'paused' }),
              },
            })
          )
        }

        controller.enqueue(encodeSSE('[DONE]'))

        if (executionId) {
          await cleanupExecutionBase64Cache(executionId)
        }

        controller.close()
      } catch (error: any) {
        logger.error(`[${requestId}] Stream error:`, error)
        controller.enqueue(
          encodeSSE({ event: 'error', error: error.message || 'Stream processing error' })
        )

        if (executionId) {
          await cleanupExecutionBase64Cache(executionId)
        }

        controller.close()
      } finally {
        timeoutController.cleanup()
      }
    },
    async cancel(reason) {
      logger.info(`[${requestId}] Streaming response cancelled`, { reason })
      timeoutController.abort()
      timeoutController.cleanup()
      if (executionId) {
        try {
          await cleanupExecutionBase64Cache(executionId)
        } catch (error) {
          logger.error(`[${requestId}] Failed to cleanup base64 cache`, { error })
        }
      }
    },
  })
}
