import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { generateId } from '@sim/utils/id'
import {
  MothershipStreamV1CompletionStatus,
  MothershipStreamV1EventType,
  MothershipStreamV1ResourceOp,
  MothershipStreamV1SessionKind,
  MothershipStreamV1TextChannel,
  MothershipStreamV1ToolExecutor,
  MothershipStreamV1ToolMode,
  MothershipStreamV1ToolOutcome,
  MothershipStreamV1ToolPhase,
} from '@/lib/copilot/generated/mothership-stream-v1'
import type { VfsSnapshotV1 } from '@/lib/copilot/generated/vfs-snapshot-v1'
import {
  createFilePreviewAdapterState,
  type FilePreviewAdapterState,
  processFilePreviewStreamEvent,
} from '@/lib/copilot/request/go/file-preview-adapter'
import { sseHandlers } from '@/lib/copilot/request/handlers'
import type { CopilotLifecycleOptions } from '@/lib/copilot/request/lifecycle/run'
import { isToolCallStreamEvent, LOCAL_STATUS_PHASE } from '@/lib/copilot/request/session'
import { handleResourceSideEffects } from '@/lib/copilot/request/tools/resources'
import type {
  ExecutionContext,
  OrchestratorOptions,
  StreamEvent,
  StreamingContext,
} from '@/lib/copilot/request/types'
import { persistChatResources } from '@/lib/copilot/resources/persistence'
import {
  extractLocalFileChatResources,
  stripLocalFileBodyToolParams,
} from '@/local-copilot/integration/file-turn-persist'
import { runLocalCopilotAgent } from '@/local-copilot/lib/agent/orchestrator'
import { formatUxPhaseStatus } from '@/local-copilot/lib/agent/ux-phase'
import type { LocalTurnCostSummary } from '@/local-copilot/lib/billing/turn-cost-accumulator'
import { getLocalCopilotConfig } from '@/local-copilot/lib/config'
import { resolveOpenWorkflowId } from '@/local-copilot/lib/context/open-workflow'
import { getLocalCopilotMemorySnapshot } from '@/local-copilot/lib/diagnostics'
import {
  DEFAULT_LOCAL_COPILOT_CATALOG_ID,
  isLocalCopilotCatalogId,
  type LocalCopilotCatalogId,
} from '@/local-copilot/lib/model-catalog'
import { loadMothershipChatHistoryForLocalCopilot } from '@/local-copilot/lib/mothership-history'
import type { ChatMessage } from '@/local-copilot/lib/providers/types'
import {
  formatLocalToolConfirmationTag,
  formatLocalWorkflowPatchTag,
} from '@/local-copilot/lib/security/tool-confirmation-policy'
import { formatTrustedControl } from '@/local-copilot/lib/security/trusted-controls'
import type { LocalCopilotStreamEvent } from '@/local-copilot/lib/types'
import { stripIdsFromUserFacingText } from '@/local-copilot/lib/user-facing-text'
import type {
  CopilotContextEntry,
  CopilotFileAttachmentRef,
} from '@/local-copilot/lib/user-turn-content'

const logger = createLogger('LocalCopilotMothershipLifecycle')

function extractString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * Reads the typed workspace inventory snapshot from the mothership payload. Sim
 * built it in `post.ts` alongside the markdown; forwarding it lets Local context
 * building skip a second identical DB fetch.
 */
function extractWorkspaceSnapshot(value: unknown): VfsSnapshotV1 | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as VfsSnapshotV1
}

function resolveCatalogIdFromPayload(
  requestPayload: Record<string, unknown>
): LocalCopilotCatalogId {
  const model = extractString(requestPayload.model)
  if (!model || !isLocalCopilotCatalogId(model)) {
    return DEFAULT_LOCAL_COPILOT_CATALOG_ID
  }
  return model
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
    const size =
      typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : null
    if (!key || !filename || !mediaType || size === null) return []
    return [{ key, filename, media_type: mediaType, size }]
  })
  return attachments.length > 0 ? attachments : undefined
}

function withStrippedFileToolArgs(event: StreamEvent): StreamEvent {
  if (!isToolCallStreamEvent(event)) return event
  const args = event.payload.arguments
  if (!args || typeof args !== 'object' || Array.isArray(args)) return event
  const stripped = stripLocalFileBodyToolParams(event.payload.toolName, args)
  if (stripped === args) return event
  return {
    ...event,
    payload: {
      ...event.payload,
      arguments: stripped,
    },
  }
}

async function dispatchStreamEvent(
  event: StreamEvent,
  context: StreamingContext,
  execContext: ExecutionContext,
  options: OrchestratorOptions,
  filePreviewState: FilePreviewAdapterState
): Promise<void> {
  try {
    await processFilePreviewStreamEvent({
      streamId: context.messageId,
      streamEvent: event,
      context,
      execContext,
      options,
      state: filePreviewState,
    })
  } catch (error) {
    logger.warn('Failed to process file preview stream event', {
      type: event.type,
      requestId: context.requestId,
      messageId: context.messageId,
      error: getErrorMessage(error),
    })
  }

  const clientEvent = withStrippedFileToolArgs(event)
  await options.onEvent?.(clientEvent)
  const handler = sseHandlers[clientEvent.type]
  if (handler) {
    await handler(clientEvent, context, execContext, options)
  }
}

async function dispatchLocalCopilotEvent(
  event: LocalCopilotStreamEvent,
  context: StreamingContext,
  execContext: ExecutionContext,
  options: CopilotLifecycleOptions,
  toolArgsByCallId: Map<string, Record<string, unknown>>,
  filePreviewState: FilePreviewAdapterState
): Promise<void> {
  if (event.type === 'status') {
    // Ephemeral UI-only: publish synthetic envelope via onEvent, skip content-block handlers.
    const statusEvent: StreamEvent = {
      type: 'run',
      payload: {
        statusPhase: LOCAL_STATUS_PHASE,
        message: event.message,
        ...(event.toolCallId ? { toolCallId: event.toolCallId } : {}),
        ...(event.toolName ? { toolName: event.toolName } : {}),
      },
    }
    logger.info('Arena Copilot publishing live status', {
      message: event.message,
      toolCallId: event.toolCallId ?? null,
      toolName: event.toolName ?? null,
    })
    await options.onEvent?.(statusEvent)
    return
  }

  if (event.type === 'tool_call_start') {
    toolArgsByCallId.set(event.toolCallId, event.args ?? {})
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.tool,
        payload: {
          phase: MothershipStreamV1ToolPhase.call,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          // Arena Copilot already ran this tool. Use `go` so Sim's auto-execute
          // path does not look up Arena-only ids (e.g. invoke_integration_tool)
          // in the built-in tools registry.
          executor: MothershipStreamV1ToolExecutor.go,
          mode: MothershipStreamV1ToolMode.sync,
          arguments: event.args,
        },
      },
      context,
      execContext,
      options,
      filePreviewState
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
          executor: MothershipStreamV1ToolExecutor.go,
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
      options,
      filePreviewState
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

    // Prefer options.chatId, then the streaming context — a missing chatId
    // skips resource upserts and leaves the mothership right panel closed.
    const chatId = options.chatId ?? context.chatId
    if (chatId && event.success) {
      // Pass runtime + projected results (identical on Arena — no secret
      // projection). Omitting projectedResult used to shift chatId into that
      // slot; projected extraction then returned [] and the length mismatch
      // dropped the upsert that opens the right panel.
      await handleResourceSideEffects(
        event.toolName,
        toolArgsByCallId.get(event.toolCallId),
        toolResult,
        toolResult,
        chatId,
        (streamEvent) =>
          dispatchStreamEvent(streamEvent, context, execContext, options, filePreviewState),
        () => Boolean(options.abortSignal?.aborted)
      )
      const fileResources = extractLocalFileChatResources(
        event.toolName,
        toolArgsByCallId.get(event.toolCallId),
        event.output
      )
      if (fileResources.length > 0) {
        await persistChatResources(chatId, fileResources)
        if (event.toolName === 'edit_content') {
          for (const resource of fileResources) {
            await dispatchStreamEvent(
              {
                type: MothershipStreamV1EventType.resource,
                payload: {
                  op: MothershipStreamV1ResourceOp.upsert,
                  resource: {
                    type: resource.type,
                    id: resource.id,
                    title: resource.title,
                    ...(resource.path ? { path: resource.path } : {}),
                  },
                },
              },
              context,
              execContext,
              options,
              filePreviewState
            )
          }
        }
      }
    }
    return
  }

  if (event.type === 'text_delta' && event.content) {
    const safeText = stripIdsFromUserFacingText(event.content)
    if (!safeText) return
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.text,
        payload: {
          channel: MothershipStreamV1TextChannel.assistant,
          text: safeText,
        },
      },
      context,
      execContext,
      options,
      filePreviewState
    )
    return
  }

  if (event.type === 'trusted_control') {
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.text,
        payload: {
          channel: MothershipStreamV1TextChannel.assistant,
          text: formatTrustedControl(event.control),
        },
      },
      context,
      execContext,
      options,
      filePreviewState
    )
    return
  }

  if (event.type === 'ux_phase') {
    await options.onEvent?.({
      type: 'run',
      payload: {
        statusPhase: LOCAL_STATUS_PHASE,
        message: formatUxPhaseStatus(event.phase),
      },
    })
    return
  }

  if (event.type === 'confirmation_required') {
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.text,
        payload: {
          channel: MothershipStreamV1TextChannel.assistant,
          text: formatLocalToolConfirmationTag(event.toolCallId, event.toolName, event.requirement),
        },
      },
      context,
      execContext,
      options,
      filePreviewState
    )
    return
  }

  if (event.type === 'verification_completed') {
    await options.onEvent?.({
      type: 'run',
      payload: {
        statusPhase: LOCAL_STATUS_PHASE,
        message: `Verified ${event.record.toolName}: ${event.record.status}`,
        toolCallId: event.record.toolCallId,
        toolName: event.record.verifierToolName,
      },
    })
    return
  }

  if (event.type === 'turn_completion') {
    // Internal completion verdict — not a user-facing status line. Publishing it
    // as agent_live_status replaced the last useful status ("Reviewing…") with
    // "Turn completion: completed_verified" and then the complete event cleared
    // the line, which made option-only settles look like the reply vanished.
    return
  }

  if (event.type === 'patch_proposed') {
    const workflowId =
      (typeof event.workflowId === 'string' && event.workflowId.trim()) ||
      extractString(execContext.workflowId) ||
      ''
    if (event.patchId && workflowId) {
      await dispatchStreamEvent(
        {
          type: MothershipStreamV1EventType.text,
          payload: {
            channel: MothershipStreamV1TextChannel.assistant,
            text: formatLocalWorkflowPatchTag({
              patchId: event.patchId,
              summary: event.patch.summary,
              workflowId,
            }),
          },
        },
        context,
        execContext,
        options,
        filePreviewState
      )
      return
    }
    const patchNote = stripIdsFromUserFacingText(
      `\n\n**Proposed workflow change:** ${event.patch.summary}\n\nCould not persist a reviewable patch. Ask Copilot to propose the change again.`
    )
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
      options,
      filePreviewState
    )
    return
  }

  if (event.type === 'error') {
    const safeMessage = stripIdsFromUserFacingText(event.message) || event.message
    context.errors.push(safeMessage)
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.error,
        payload: { message: safeMessage, code: 'local_copilot_error' },
      },
      context,
      execContext,
      options,
      filePreviewState
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
  const workspaceSnapshot = extractWorkspaceSnapshot(requestPayload.vfs)
  const workflowId =
    extractString(options.workflowId) ??
    extractString(requestPayload.workflowId) ??
    extractString(execContext.workflowId) ??
    resolveOpenWorkflowId({
      contexts,
      snapshotWorkflows: workspaceSnapshot?.workflows,
    })
  const workspaceId = options.workspaceId ?? extractString(requestPayload.workspaceId)
  const userId = options.userId
  const filePreviewState = createFilePreviewAdapterState()

  if (!message) {
    context.errors.push('Message is required')
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.error,
        payload: { message: 'Message is required', code: 'validation_error' },
      },
      context,
      execContext,
      options,
      filePreviewState
    )
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.complete,
        payload: { status: MothershipStreamV1CompletionStatus.error },
      },
      context,
      execContext,
      options,
      filePreviewState
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
      options,
      filePreviewState
    )
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.complete,
        payload: { status: MothershipStreamV1CompletionStatus.error },
      },
      context,
      execContext,
      options,
      filePreviewState
    )
    return
  }

  logger.info('Running Arena Copilot mothership lifecycle', {
    workflowId: workflowId ?? null,
    workspaceId,
    userId,
    chatId: options.chatId ?? null,
    messageChars: message.length,
    contextEntries: contexts?.length ?? 0,
    fileAttachments: fileAttachments?.length ?? 0,
    hasWorkspaceSnapshot: Boolean(workspaceContext),
    memory: getLocalCopilotMemorySnapshot(),
  })

  const startedAt = Date.now()
  const toolArgsByCallId = new Map<string, Record<string, unknown>>()
  const userMessageId =
    typeof requestPayload.messageId === 'string' ? requestPayload.messageId : undefined
  let turnUsage:
    | {
        model: string
        inputTokens: number
        outputTokens: number
      }
    | undefined
  const isMothershipBlockExecute =
    typeof options.goRoute === 'string' && options.goRoute.startsWith('/api/mothership/execute')
  /** Workflow owns block cost via `result.cost`; interactive Local chat writes the ledger. */
  const writeChatLedger = !isMothershipBlockExecute
  let blockExecuteCost: LocalTurnCostSummary | undefined

  let priorMessages: ChatMessage[] = []
  let sessionMemoryTurns: Awaited<
    ReturnType<typeof loadMothershipChatHistoryForLocalCopilot>
  >['sessionMemoryTurns'] = []
  if (options.chatId) {
    const history = await loadMothershipChatHistoryForLocalCopilot({
      chatId: options.chatId,
      userId,
      excludeMessageId: userMessageId,
    })
    priorMessages = history.messages
    sessionMemoryTurns = history.sessionMemoryTurns
    logger.info('Loaded mothership chat history for Arena Copilot', {
      chatId: options.chatId,
      turns: priorMessages.length,
      sessionMemoryTurns: sessionMemoryTurns.length,
      memory: getLocalCopilotMemorySnapshot(),
    })
  }

  try {
    let eventCount = 0
    let toolCallCount = 0
    const catalogId = resolveCatalogIdFromPayload(requestPayload)
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.session,
        payload: {
          kind: MothershipStreamV1SessionKind.start,
          data: { responseId: generateId() },
        },
      },
      context,
      execContext,
      options,
      filePreviewState
    )
    const agent = runLocalCopilotAgent({
      userId,
      workspaceId,
      message,
      chatId: options.chatId,
      runId: options.runId ?? execContext.runId,
      catalogId,
      ...(userMessageId ? { messageId: userMessageId } : {}),
      ...(isMothershipBlockExecute && (options.executionId ?? execContext.executionId)
        ? { parentExecutionId: options.executionId ?? execContext.executionId }
        : {}),
      priorMessages,
      sessionMemoryTurns,
      persistLocally: false,
      writeChatLedger,
      ...(contexts ? { contexts } : {}),
      ...(fileAttachments ? { fileAttachments } : {}),
      ...(workspaceContext ? { workspaceContext } : {}),
      ...(workspaceSnapshot ? { workspaceSnapshot } : {}),
      ...(workflowId ? { workflowId } : {}),
      ...(execContext.userPermission ? { userPermission: execContext.userPermission } : {}),
      ...(execContext.billingAttribution
        ? { billingAttribution: execContext.billingAttribution }
        : {}),
      signal: options.abortSignal,
    })

    while (true) {
      const { done, value } = await agent.next()
      if (done) {
        blockExecuteCost = value
        break
      }

      const event = value
      if (options.abortSignal?.aborted) {
        context.wasAborted = true
        logger.warn('Arena Copilot mothership lifecycle aborted', {
          workspaceId,
          workflowId: workflowId ?? null,
          eventCount,
          toolCallCount,
          durationMs: Date.now() - startedAt,
          memory: getLocalCopilotMemorySnapshot(),
        })
        break
      }

      eventCount += 1
      if (event.type === 'tool_call_start') toolCallCount += 1
      if (event.type === 'done' && event.usage) {
        turnUsage = event.usage
      }

      await dispatchLocalCopilotEvent(
        event,
        context,
        execContext,
        options,
        toolArgsByCallId,
        filePreviewState
      )
    }

    const status =
      context.errors.length > 0
        ? MothershipStreamV1CompletionStatus.error
        : context.wasAborted
          ? MothershipStreamV1CompletionStatus.cancelled
          : MothershipStreamV1CompletionStatus.complete

    const billingModel = turnUsage?.model || getLocalCopilotConfig().model
    context.billingModel = billingModel
    context.completionStatus = status

    logger.info('Arena Copilot mothership lifecycle finished', {
      workspaceId,
      workflowId: workflowId ?? null,
      status,
      eventCount,
      toolCallCount,
      errorCount: context.errors.length,
      model: billingModel,
      inputTokens: turnUsage?.inputTokens ?? 0,
      outputTokens: turnUsage?.outputTokens ?? 0,
      turnCost: blockExecuteCost?.total ?? 0,
      writeChatLedger,
      durationMs: Date.now() - startedAt,
      memory: getLocalCopilotMemorySnapshot(),
    })

    // Defer the `complete` SSE until after `onComplete` persists the assistant
    // row (run.ts → finalizeStream). Publishing complete here races the client's
    // detail refetch and can replace the rich live turn with an empty message.
    if (turnUsage && (turnUsage.inputTokens > 0 || turnUsage.outputTokens > 0)) {
      context.usage = {
        prompt: turnUsage.inputTokens,
        completion: turnUsage.outputTokens,
      }
    }

    if (blockExecuteCost && blockExecuteCost.total > 0) {
      context.cost = {
        input: blockExecuteCost.input,
        output: blockExecuteCost.output,
        total: blockExecuteCost.total,
      }
    }
  } catch (error) {
    const messageText = getErrorMessage(error, 'Arena Copilot failed')
    logger.error('Arena Copilot mothership lifecycle failed', {
      error: messageText,
      workspaceId,
      workflowId: workflowId ?? null,
      durationMs: Date.now() - startedAt,
      memory: getLocalCopilotMemorySnapshot(),
    })
    context.errors.push(messageText)
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.error,
        payload: { message: messageText, code: 'local_copilot_error' },
      },
      context,
      execContext,
      options,
      filePreviewState
    )
    await dispatchStreamEvent(
      {
        type: MothershipStreamV1EventType.complete,
        payload: { status: MothershipStreamV1CompletionStatus.error },
      },
      context,
      execContext,
      options,
      filePreviewState
    )
  }
}
