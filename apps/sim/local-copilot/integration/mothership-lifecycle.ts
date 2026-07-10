import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import {
  MothershipStreamV1CompletionStatus,
  MothershipStreamV1EventType,
  MothershipStreamV1TextChannel,
  MothershipStreamV1ToolExecutor,
  MothershipStreamV1ToolMode,
  MothershipStreamV1ToolOutcome,
  MothershipStreamV1ToolPhase,
} from '@/lib/copilot/generated/mothership-stream-v1'
import { sseHandlers } from '@/lib/copilot/request/handlers'
import type { CopilotLifecycleOptions } from '@/lib/copilot/request/lifecycle/run'
import { handleResourceSideEffects } from '@/lib/copilot/request/tools/resources'
import type {
  ExecutionContext,
  OrchestratorOptions,
  StreamEvent,
  StreamingContext,
} from '@/lib/copilot/request/types'
import { runLocalCopilotAgent } from '@/local-copilot/lib/agent/orchestrator'
import { loadMothershipChatHistoryForLocalCopilot } from '@/local-copilot/lib/mothership-history'
import type { CopilotContextEntry, CopilotFileAttachmentRef } from '@/local-copilot/lib/user-turn-content'
import type { LocalCopilotStreamEvent } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotMothershipLifecycle')

function extractString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function extractContexts(value: unknown): CopilotContextEntry[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const contexts = value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    const type = extractString(record.type)
    const content = typeof record.content === 'string' ? record.content : ''
    const path = extractString(record.path)
    if (!type || (!content.trim() && !path)) return []
    return [
      {
        type,
        content,
        ...(extractString(record.tag) ? { tag: extractString(record.tag) } : {}),
        ...(path ? { path } : {}),
      },
    ]
  })
  return contexts.length > 0 ? contexts : undefined
}

function extractFileAttachments(value: unknown): CopilotFileAttachmentRef[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const attachments = value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    const key = extractString(record.key)
    const filename = extractString(record.filename)
    const mediaType = extractString(record.media_type)
    const size = typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : null
    if (!key || !filename || !mediaType || size === null) return []
    return [{ key, filename, media_type: mediaType, size }]
  })
  return attachments.length > 0 ? attachments : undefined
}

async function dispatchStreamEvent(
  event: StreamEvent,
  context: StreamingContext,
  execContext: ExecutionContext,
  options: OrchestratorOptions
): Promise<void> {
  await options.onEvent?.(event)
  const handler = sseHandlers[event.type]
  if (handler) {
    await handler(event, context, execContext, options)
  }
}

async function dispatchLocalCopilotEvent(
  event: LocalCopilotStreamEvent,
  context: StreamingContext,
  execContext: ExecutionContext,
  options: CopilotLifecycleOptions,
  toolArgsByCallId: Map<string, Record<string, unknown>>
): Promise<void> {
  if (event.type === 'tool_call_start') {
    toolArgsByCallId.set(event.toolCallId, event.args ?? {})
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.tool,
        payload: {
          phase: MothershipStreamV1ToolPhase.call,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          executor: MothershipStreamV1ToolExecutor.sim,
          mode: MothershipStreamV1ToolMode.sync,
        },
      },
      context,
      execContext,
      options
    )
    return
  }

  if (event.type === 'tool_call_result') {
    const toolResult = {
      success: event.success,
      output: event.output,
      error: event.error,
      ...(event.resources?.length ? { resources: event.resources } : {}),
    }

    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.tool,
        payload: {
          phase: MothershipStreamV1ToolPhase.result,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          executor: MothershipStreamV1ToolExecutor.sim,
          mode: MothershipStreamV1ToolMode.sync,
          success: event.success,
          output: event.output,
          ...(event.error ? { error: event.error } : {}),
          status: event.success
            ? MothershipStreamV1ToolOutcome.success
            : MothershipStreamV1ToolOutcome.error,
        },
      },
      context,
      execContext,
      options
    )

    if (
      event.toolName === 'create_workflow' &&
      event.success &&
      event.output &&
      typeof event.output === 'object'
    ) {
      const workflowId = (event.output as Record<string, unknown>).workflowId
      if (typeof workflowId === 'string' && workflowId.trim()) {
        execContext.workflowId = workflowId
      }
    }

    const chatId = options.chatId
    if (chatId && event.success) {
      await handleResourceSideEffects(
        event.toolName,
        toolArgsByCallId.get(event.toolCallId),
        toolResult,
        chatId,
        (streamEvent) => dispatchStreamEvent(streamEvent, context, execContext, options),
        () => Boolean(options.abortSignal?.aborted)
      )
    }
    return
  }

  if (event.type === 'text_delta' && event.content) {
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.text,
        payload: {
          channel: MothershipStreamV1TextChannel.assistant,
          text: event.content,
        },
      },
      context,
      execContext,
      options
    )
    return
  }

  if (event.type === 'patch_proposed') {
    const patchNote = `\n\n**Proposed workflow change:** ${event.patch.summary}\n\nReview and apply patches from the workflow Chat panel when using Arena Copilot UI.`
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.text,
        payload: {
          channel: MothershipStreamV1TextChannel.assistant,
          text: patchNote,
        },
      },
      context,
      execContext,
      options
    )
    return
  }

  if (event.type === 'error') {
    context.errors.push(event.message)
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.error,
        payload: { message: event.message, code: 'local_copilot_error' },
      },
      context,
      execContext,
      options
    )
  }
}

/**
 * Runs Arena Copilot in-process and emits Mothership-compatible stream events
 * so existing `/api/mothership/chat` + `useChat` work without the Go backend.
 */
export async function runLocalCopilotMothershipLifecycle(
  requestPayload: Record<string, unknown>,
  context: StreamingContext,
  execContext: ExecutionContext,
  options: CopilotLifecycleOptions
): Promise<void> {
  const message = extractString(requestPayload.message)
  const contexts = extractContexts(requestPayload.context)
  const fileAttachments = extractFileAttachments(requestPayload.fileAttachments)
  const workspaceContext = extractString(requestPayload.workspaceContext)
  const workflowId = options.workflowId ?? extractString(requestPayload.workflowId)
  const workspaceId = options.workspaceId ?? extractString(requestPayload.workspaceId)
  const userId = options.userId

  if (!message) {
    context.errors.push('Message is required')
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.error,
        payload: { message: 'Message is required', code: 'validation_error' },
      },
      context,
      execContext,
      options
    )
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.complete,
        payload: { status: MothershipStreamV1CompletionStatus.error },
      },
      context,
      execContext,
      options
    )
    return
  }

  if (!workspaceId || !userId) {
    context.errors.push('Arena Copilot requires workspaceId')
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.error,
        payload: {
          message: 'Workspace context is required for Arena Copilot',
          code: 'missing_workspace_context',
        },
      },
      context,
      execContext,
      options
    )
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.complete,
        payload: { status: MothershipStreamV1CompletionStatus.error },
      },
      context,
      execContext,
      options
    )
    return
  }

  logger.info('Running Arena Copilot mothership lifecycle', {
    workflowId: workflowId ?? null,
    workspaceId,
  })

  const toolArgsByCallId = new Map<string, Record<string, unknown>>()
  const userMessageId =
    typeof requestPayload.messageId === 'string' ? requestPayload.messageId : undefined

  let priorMessages: Awaited<ReturnType<typeof loadMothershipChatHistoryForLocalCopilot>> = []
  if (options.chatId) {
    priorMessages = await loadMothershipChatHistoryForLocalCopilot({
      chatId: options.chatId,
      userId,
      excludeMessageId: userMessageId,
    })
    logger.info('Loaded mothership chat history for Arena Copilot', {
      chatId: options.chatId,
      turns: priorMessages.length,
    })
  }

  try {
    for await (const event of runLocalCopilotAgent({
      userId,
      workspaceId,
      message,
      chatId: options.chatId,
      priorMessages,
      persistLocally: false,
      ...(contexts ? { contexts } : {}),
      ...(fileAttachments ? { fileAttachments } : {}),
      ...(workspaceContext ? { workspaceContext } : {}),
      ...(workflowId ? { workflowId } : {}),
      ...(execContext.userPermission ? { userPermission: execContext.userPermission } : {}),
      signal: options.abortSignal,
    })) {
      if (options.abortSignal?.aborted) {
        context.wasAborted = true
        break
      }

      await dispatchLocalCopilotEvent(
        event,
        context,
        execContext,
        options,
        toolArgsByCallId
      )
    }

    const status =
      context.errors.length > 0
        ? MothershipStreamV1CompletionStatus.error
        : context.wasAborted
          ? MothershipStreamV1CompletionStatus.cancelled
          : MothershipStreamV1CompletionStatus.complete

    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.complete,
        payload: { status },
      },
      context,
      execContext,
      options
    )
  } catch (error) {
    const messageText = getErrorMessage(error, 'Arena Copilot failed')
    logger.error('Arena Copilot mothership lifecycle failed', { error: messageText })
    context.errors.push(messageText)
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.error,
        payload: { message: messageText, code: 'local_copilot_error' },
      },
      context,
      execContext,
      options
    )
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.complete,
        payload: { status: MothershipStreamV1CompletionStatus.error },
      },
      context,
      execContext,
      options
    )
  }
}
