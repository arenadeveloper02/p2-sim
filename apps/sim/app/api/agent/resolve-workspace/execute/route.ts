import { db } from '@sim/db'
import { copilotChats } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { generateInternalToken } from '@/lib/auth/internal'
import { appendCopilotChatMessages } from '@/lib/copilot/chat/messages-store'
import { normalizeMessage, type PersistedMessage } from '@/lib/copilot/chat/persisted-message'
import { chatPubSub } from '@/lib/copilot/chat-status'
import { requestChatTitle } from '@/lib/copilot/request/lifecycle/start'
import { generateRequestId } from '@/lib/core/utils/request'
import { getBaseUrl, getInternalApiBaseUrl } from '@/lib/core/utils/urls'

const logger = createLogger('AgentResolveWorkspaceExecute')

const ExecuteRequestSchema = z.object({
  userApiKey: z.string().optional(),
  workflowId: z.string().uuid().optional(),
  input: z.string().min(1),
  conversationId: z.string().optional(),
  selectedOutputs: z.array(z.string()).default([]),
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Prefer the in-cluster / same-deployment base URL when the configured agent host
 * matches this app, so internal JWT auth works for loopback execute calls.
 * Kept for the commented cross-host path below.
 */
function resolveExecuteBaseUrl(agentBaseUrl: string): string {
  try {
    const configured = new URL(agentBaseUrl)
    const app = new URL(getBaseUrl())
    if (configured.host === app.host) {
      return getInternalApiBaseUrl().replace(/\/$/, '')
    }
  } catch {
    // fall through to the configured agent base URL
  }
  return agentBaseUrl.replace(/\/$/, '')
}

/**
 * Resolve workflows often return a stale/invalid apiKey. For same-deployment
 * loopback executes, authenticate as the logged-in user with an internal JWT.
 * Kept for the commented cross-host path below.
 */
function shouldUseInternalJwt(agentBaseUrl: string): boolean {
  try {
    return new URL(agentBaseUrl).host === new URL(getBaseUrl()).host
  } catch {
    return false
  }
}

type TextEnvelope = {
  v: 1
  type: 'text'
  seq: number
  ts: string
  stream: {
    streamId: string
    chatId: string
    cursor: string
  }
  trace: {
    requestId: string
  }
  scope?: {
    lane: 'subagent'
    agentId?: string
    parentToolCallId?: string
  }
  payload: {
    channel: 'assistant'
    text: string
  }
}

type CompleteEnvelope = {
  v: 1
  type: 'complete'
  seq: number
  ts: string
  stream: {
    streamId: string
    chatId: string
    cursor: string
  }
  trace: {
    requestId: string
  }
  scope?: {
    lane: 'subagent'
    agentId?: string
    parentToolCallId?: string
  }
  payload: {
    status: 'complete'
  }
}

type ToolEnvelope = {
  v: 1
  type: 'tool'
  seq: number
  ts: string
  stream: {
    streamId: string
    chatId: string
    cursor: string
  }
  trace: {
    requestId: string
  }
  scope?: {
    lane: 'subagent'
    agentId?: string
    parentToolCallId?: string
  }
  payload: {
    toolCallId: string
    toolName: 'run'
    arguments?: {
      request: string
    }
    argumentsDelta?: string
    executor?: 'sim'
    mode?: 'async'
    phase: 'args_delta' | 'call' | 'result'
    status?: 'executing' | 'success' | 'error' | 'cancelled'
    ui?: {
      title: string
      phaseLabel: string
      icon: 'play'
      internal: true
    }
    success?: boolean
    output?: unknown
    error?: string
  }
}

const STATUS_ROTATION_MS = 2_500

type StatusCategory = 'email' | 'drive' | 'calendar' | 'arena'

const STATUS_CATEGORY_PATTERNS: Record<StatusCategory, readonly string[]> = {
  email: ['email', 'gmail', 'inbox'],
  drive: ['drive', 'document', 'file'],
  calendar: ['calendar', 'meeting', 'event'],
  arena: ['arena', 'task', 'project', 'workflow'],
}

const STATUS_CATEGORY_MESSAGES: Record<StatusCategory, string> = {
  email: 'Reading emails and preparing the summary...',
  drive: 'Getting details from Drive and related files...',
  calendar: 'Checking calendar events and availability...',
  arena: 'Looking up Arena task and workflow details...',
}

function detectStatusCategories(input: string): StatusCategory[] {
  const normalized = input.toLowerCase()
  return (Object.keys(STATUS_CATEGORY_PATTERNS) as StatusCategory[]).filter((category) =>
    STATUS_CATEGORY_PATTERNS[category].some((pattern) => normalized.includes(pattern))
  )
}

function getDynamicStatusMessages(input: string): string[] {
  const categories = detectStatusCategories(input)
  const messages = ['Reading credentials...', 'Verifying connected service access...']

  if (categories.length > 1) {
    messages.push('Gathering data from multiple sources...')
  }

  for (const category of categories) {
    messages.push(STATUS_CATEGORY_MESSAGES[category])
  }

  if (categories.length === 0) {
    messages.push('Running the workflow and collecting details...')
  } else {
    messages.push('Preparing your response...')
  }

  return messages
}

function extractFirstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized || normalized === '[DONE]') {
      return undefined
    }
    return value
  }
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const record = value as Record<string, unknown>
  const directKeys = [
    'text',
    'chunk',
    'delta',
    'content',
    'message',
    'response',
    'output',
    'answer',
  ] as const

  for (const key of directKeys) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate
    }
  }

  const nestedKeys = ['payload', 'data', 'result'] as const
  for (const key of nestedKeys) {
    const nested = extractFirstString(record[key])
    if (nested) return nested
  }

  return undefined
}

function extractTopLevelContent(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const content = (value as Record<string, unknown>).content
  return typeof content === 'string' && content.trim().length > 0 ? content : ''
}

function appendBlockTextParts(blockOutputs: unknown, parts: string[]) {
  if (!blockOutputs || typeof blockOutputs !== 'object') return
  const block = blockOutputs as Record<string, unknown>
  for (const key of ['content', 'result', 'text', 'message', 'response', 'answer'] as const) {
    const value = block[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      parts.push(value)
      return
    }
  }
}

/** Fallback when selectedOutputs are absent or do not match anything in the payload. */
function extractContentFromFinalData(dataRecord: Record<string, unknown>): string {
  const directContent = extractTopLevelContent(dataRecord)
  if (directContent) return directContent

  const outputContent = extractTopLevelContent(dataRecord.output)
  if (outputContent) return outputContent

  if (!dataRecord.output || typeof dataRecord.output !== 'object') {
    return ''
  }

  const parts: string[] = []
  for (const blockOutputs of Object.values(dataRecord.output as Record<string, unknown>)) {
    appendBlockTextParts(blockOutputs, parts)
  }
  return parts.join('\n\n')
}

function extractTextFromFinalOutput(output: unknown, selectedOutputs: readonly string[]): string {
  if (!output || typeof output !== 'object') return ''

  const outputRecord = output as Record<string, unknown>
  const parts: string[] = []

  if (selectedOutputs.length > 0) {
    for (const outputId of selectedOutputs) {
      const [blockId, ...pathParts] = outputId.split('.')
      if (!blockId) continue
      const blockOutputs = outputRecord[blockId]
      if (!blockOutputs || typeof blockOutputs !== 'object') continue
      if (pathParts.length === 0) {
        appendBlockTextParts(blockOutputs, parts)
        continue
      }
      let current: unknown = blockOutputs
      for (const segment of pathParts) {
        if (!current || typeof current !== 'object' || !(segment in current)) {
          current = undefined
          break
        }
        current = (current as Record<string, unknown>)[segment]
      }
      if (typeof current === 'string' && current.trim().length > 0) {
        parts.push(current)
      }
    }
    if (parts.length > 0) {
      return parts.join('\n\n')
    }
  }

  return extractContentFromFinalData({ output: outputRecord })
}

function extractTextFromWorkflowSsePayload(
  record: Record<string, unknown>,
  selectedOutputs: readonly string[]
): string | undefined {
  const eventType = record.event
  if (typeof eventType !== 'string') {
    return undefined
  }

  switch (eventType) {
    case 'final': {
      const data = record.data
      if (!data || typeof data !== 'object') {
        return ''
      }
      const dataRecord = data as Record<string, unknown>
      if (typeof dataRecord.error === 'string' && dataRecord.error.trim().length > 0) {
        return dataRecord.error
      }
      if (
        dataRecord.error &&
        typeof dataRecord.error === 'object' &&
        typeof (dataRecord.error as { message?: unknown }).message === 'string'
      ) {
        return (dataRecord.error as { message: string }).message
      }
      const fromSelectedOutputs = extractTextFromFinalOutput(dataRecord.output, selectedOutputs)
      if (fromSelectedOutputs) {
        return fromSelectedOutputs
      }
      return extractContentFromFinalData(dataRecord)
    }
    case 'error': {
      if (typeof record.error === 'string' && record.error.trim().length > 0) {
        return record.error
      }
      const data = record.data
      if (data && typeof data === 'object') {
        const dataRecord = data as Record<string, unknown>
        if (typeof dataRecord.error === 'string' && dataRecord.error.trim().length > 0) {
          return dataRecord.error
        }
        if (
          dataRecord.error &&
          typeof dataRecord.error === 'object' &&
          typeof (dataRecord.error as { message?: unknown }).message === 'string'
        ) {
          return (dataRecord.error as { message: string }).message
        }
      }
      return ''
    }
    case 'cancelled':
      return ''
    default:
      return undefined
  }
}

function extractTextFromUpstreamData(raw: string, selectedOutputs: readonly string[]): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '[DONE]') return ''

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object') {
      const controlEventText = extractTextFromWorkflowSsePayload(
        parsed as Record<string, unknown>,
        selectedOutputs
      )
      if (controlEventText !== undefined) {
        return controlEventText
      }
    }
    return extractFirstString(parsed) ?? ''
  } catch {
    return trimmed
  }
}

function toSseDataLine(event: TextEnvelope | CompleteEnvelope | ToolEnvelope): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

async function persistWorkflowChatTurn(params: {
  chatId: string
  userId: string
  userInput: string
  assistantOutput: string
  requestId: string
}) {
  const { chatId, userId, userInput, assistantOutput, requestId } = params
  if (!assistantOutput.trim()) return

  const [chat] = await db
    .select({
      id: copilotChats.id,
      title: copilotChats.title,
      workspaceId: copilotChats.workspaceId,
      model: copilotChats.model,
    })
    .from(copilotChats)
    .where(
      and(
        eq(copilotChats.id, chatId),
        eq(copilotChats.userId, userId),
        eq(copilotChats.type, 'mothership')
      )
    )
    .limit(1)

  if (!chat) {
    logger.error('Cannot persist workflow chat turn — mothership chat not found', {
      chatId,
      userId,
    })
    return
  }

  // Title generation (optional; failures must not block message persistence).
  if (!chat.title) {
    try {
      const generatedTitle = await requestChatTitle({
        message: userInput,
        model: 'claude-opus-4-6',
      })
      if (generatedTitle) {
        await db
          .update(copilotChats)
          .set({ title: generatedTitle, updatedAt: new Date() })
          .where(eq(copilotChats.id, chatId))
        if (chat.workspaceId) {
          chatPubSub?.publishStatusChanged({
            workspaceId: chat.workspaceId,
            chatId,
            type: 'renamed',
          })
        }
      }
    } catch (error) {
      logger.warn('Failed to generate title before persisting workflow chat turn', {
        chatId,
        error: getErrorMessage(error),
      })
    }
  }

  const userMessage: PersistedMessage = normalizeMessage({
    id: generateRequestId(),
    role: 'user',
    content: userInput,
    timestamp: new Date().toISOString(),
  })
  const assistantMessage: PersistedMessage = normalizeMessage({
    id: generateRequestId(),
    role: 'assistant',
    content: assistantOutput,
    timestamp: new Date().toISOString(),
    requestId,
    contentBlocks: [
      {
        type: 'text',
        channel: 'assistant',
        content: assistantOutput,
      },
      {
        type: 'complete',
        status: 'complete',
      },
    ],
  })

  // NEW: transcript lives in `copilot_messages` (same as mothership/chat paths).
  // GET /api/mothership/chats/:id reads via loadCopilotChatMessages — not JSONB.
  await appendCopilotChatMessages(
    chatId,
    [userMessage, assistantMessage],
    { chatModel: chat.model ?? null, streamId: requestId }
  )

  // Clear active-stream marker + bump updatedAt so the chat list refreshes.
  await db
    .update(copilotChats)
    .set({
      conversationId: null,
      updatedAt: new Date(),
    })
    .where(eq(copilotChats.id, chatId))

  // OLD (broken after messages moved off copilot_chats): wrote to removed JSONB
  // column, so title could update but GET still returned messages: [].
  // await db
  //   .update(copilotChats)
  //   .set({
  //     messages: sql`${copilotChats.messages} || ${JSON.stringify([userMessage, assistantMessage])}::jsonb`,
  //     conversationId: null,
  //     updatedAt: new Date(),
  //   })
  //   .where(
  //     and(
  //       eq(copilotChats.id, chatId),
  //       eq(copilotChats.userId, userId),
  //       eq(copilotChats.type, 'mothership')
  //     )
  //   )

  logger.info('Persisted workflow execution chat turn', {
    chatId,
    userId,
    requestId,
    assistantLength: assistantOutput.length,
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    logger.warn('Unauthorized workflow execution request — no active session')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  let body: z.infer<typeof ExecuteRequestSchema>
  try {
    body = ExecuteRequestSchema.parse(await req.json())
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Invalid resolve-workspace execute request body', { errors: error.errors })
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.workflowId) {
    return NextResponse.json({ error: 'workflowId is required' }, { status: 400 })
  }

  // Always authenticate the execute hop as the logged-in user with an internal JWT.
  // Same pattern as /api/workflows/embed-html — avoids:
  // 1) stale resolve-workspace userApiKey → 401
  // 2) API-key free-plan paywall → 402 (`isWorkspaceApiExecutionEntitled`)
  //
  // Execute against this app (internal/base URL), not SIM_AGENT_BASE_URL. Resolve may
  // run against a configured agent host, but chats + workflows share this DB, so
  // loopback JWT execute is the correct path for the embed chat.
  const agentBaseUrl = getInternalApiBaseUrl().replace(/\/$/, '')
  // OLD (cross-host API key — hit free-plan 402 when BILLING + FREE_API gate are on):
  // const configuredAgentBaseUrl = process.env.SIM_AGENT_BASE_URL?.replace(/\/$/, '')
  // const useInternalJwt = shouldUseInternalJwt(configuredAgentBaseUrl)
  // const apiKey = body.userApiKey ?? process.env.SIM_WORKFLOW_API_KEY_UNIFIED
  // const agentBaseUrl = resolveExecuteBaseUrl(configuredAgentBaseUrl!)
  const executeUrl = `${agentBaseUrl}/api/workflows/${body.workflowId}/execute`

  try {
    const streamId = generateRequestId()
    const requestId = generateRequestId()
    const chatId = body.conversationId ?? streamId
    const toolCallId = generateRequestId()

    const transformed = new ReadableStream<Uint8Array>({
      async start(controller) {
        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
        const decoder = new TextDecoder()
        const encoder = new TextEncoder()
        let buffer = ''
        let sawSsePrefix = false
        let seq = 0
        let accumulatedAssistantText = ''
        let hasEmittedToolResult = false
        const displayedStatusLines: string[] = []
        let statusRotationTimer: ReturnType<typeof setInterval> | null = null

        const emitEvent = (event: TextEnvelope | CompleteEnvelope | ToolEnvelope) => {
          controller.enqueue(encoder.encode(toSseDataLine(event)))
        }

        const stopStatusRotation = () => {
          if (statusRotationTimer) {
            clearInterval(statusRotationTimer)
            statusRotationTimer = null
          }
        }

        const nextSeq = () => {
          seq += 1
          return seq
        }

        const emitTextEvent = (text: string) => {
          if (!text) return
          stopStatusRotation()
          accumulatedAssistantText += text
          const event: TextEnvelope = {
            v: 1,
            type: 'text',
            seq: nextSeq(),
            ts: new Date().toISOString(),
            stream: {
              streamId,
              chatId,
              cursor: String(seq),
            },
            trace: {
              requestId,
            },
            payload: {
              channel: 'assistant',
              text,
            },
          }
          emitEvent(event)
        }
        const emitToolResultEvent = (params: {
          status: 'success' | 'error'
          success: boolean
          output?: unknown
          error?: string
          scope?: {
            lane: 'subagent'
            agentId?: string
            parentToolCallId?: string
          }
        }) => {
          if (hasEmittedToolResult) return
          hasEmittedToolResult = true
          emitEvent({
            v: 1,
            type: 'tool',
            seq: nextSeq(),
            ts: new Date().toISOString(),
            stream: { streamId, chatId, cursor: String(seq) },
            trace: { requestId },
            ...(params.scope ? { scope: params.scope } : {}),
            payload: {
              toolCallId,
              toolName: 'run',
              executor: 'sim',
              mode: 'async',
              phase: 'result',
              status: params.status,
              success: params.success,
              ...(params.output !== undefined ? { output: params.output } : {}),
              ...(params.error ? { error: params.error } : {}),
            },
          })
        }

        const statusMessages = getDynamicStatusMessages(body.input)
        const runScope = {
          lane: 'subagent' as const,
          agentId: 'run',
        }

        const emitToolExecutingStatus = (title: string) => {
          if (hasEmittedToolResult) return
          emitEvent({
            v: 1,
            type: 'tool',
            seq: nextSeq(),
            ts: new Date().toISOString(),
            stream: { streamId, chatId, cursor: String(seq) },
            trace: { requestId },
            scope: runScope,
            payload: {
              toolCallId,
              toolName: 'run',
              arguments: { request: body.input },
              executor: 'sim',
              mode: 'async',
              phase: 'call',
              status: 'executing',
              ui: {
                title,
                phaseLabel: 'Run Agent',
                icon: 'play',
                internal: true,
              },
            },
          })
        }

        const appendStatusMessage = (message: string) => {
          displayedStatusLines.push(message)
          emitToolExecutingStatus(displayedStatusLines.join('\n'))
        }

        const advanceStatusMessage = () => {
          const nextIndex = displayedStatusLines.length
          if (nextIndex >= statusMessages.length) {
            stopStatusRotation()
            return
          }
          appendStatusMessage(statusMessages[nextIndex]!)
        }

        appendStatusMessage(statusMessages[0] ?? 'Running the workflow and collecting details...')

        if (statusMessages.length > 1) {
          statusRotationTimer = setInterval(advanceStatusMessage, STATUS_ROTATION_MS)
        }

        const processRawFrame = (rawFrame: string) => {
          const frame = rawFrame.trim()
          if (!frame) return

          if (frame.includes('\ndata:') || frame.startsWith('data:')) {
            sawSsePrefix = true
            const dataLines = frame
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
            const mergedData = dataLines.join('\n').trim()
            const text = extractTextFromUpstreamData(mergedData, body.selectedOutputs)
            emitTextEvent(text)
            return
          }

          if (!sawSsePrefix) {
            const text = extractTextFromUpstreamData(frame, body.selectedOutputs)
            emitTextEvent(text)
          }
        }

        try {
          const executeBody = JSON.stringify({
            input: body.input,
            ...(body.conversationId ? { conversationId: body.conversationId } : {}),
            stream: true,
            selectedOutputs: body.selectedOutputs,
            email: session.user.email,
            userId: session.user.id,
          })

          /**
           * Build loopback auth headers.
           * Prefer Cookie-only (AuthType.SESSION) — never hits the free-plan API-key 402 gate.
           * Do NOT send Authorization Bearer together with Cookie: an invalid JWT can
           * short-circuit hybrid auth before session is considered on some paths, and
           * proxies sometimes strip Bearer on public self-calls.
           * JWT is the fallback when the inbound request has no cookie.
           */
          const buildLoopbackHeaders = async (mode: 'session' | 'jwt'): Promise<{
            headers: Record<string, string>
            authType: string
          }> => {
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            }
            if (mode === 'session') {
              const sessionCookie = req.headers.get('cookie')
              if (!sessionCookie) {
                throw new Error('No session cookie available for loopback execute')
              }
              headers.Cookie = sessionCookie
              return { headers, authType: 'session_cookie' }
            }
            headers.Authorization = `Bearer ${await generateInternalToken(userId)}`
            return { headers, authType: 'internal_jwt' }
          }

          // OLD API-key path (disabled — free-plan workspaces return 402):
          // headers['X-API-Key'] = body.userApiKey ?? process.env.SIM_WORKFLOW_API_KEY_UNIFIED!

          const hasInboundCookie = Boolean(req.headers.get('cookie'))
          const authAttempts: Array<'session' | 'jwt'> = hasInboundCookie
            ? ['session', 'jwt']
            : ['jwt']

          let upstream: Response | null = null
          let usedAuthType = 'none'

          for (const mode of authAttempts) {
            const { headers, authType } = await buildLoopbackHeaders(mode)
            usedAuthType = authType
            logger.info('Executing resolved workspace workflow', {
              userId,
              workflowId: body.workflowId,
              executeUrl,
              authType,
              attempt: mode,
            })
            upstream = await fetch(executeUrl, {
              method: 'POST',
              headers,
              body: executeBody,
            })
            // Retry with the next auth mode on paywall / auth failures.
            if (upstream.ok || (upstream.status !== 401 && upstream.status !== 402)) {
              break
            }
            logger.warn('Loopback execute auth attempt failed; trying next mode', {
              userId,
              workflowId: body.workflowId,
              authType,
              status: upstream.status,
            })
          }

          if (!upstream) {
            throw new Error('No upstream workflow response')
          }

          const persistBeforeComplete = async () => {
            if (!body.conversationId || !accumulatedAssistantText.trim()) return
            try {
              await persistWorkflowChatTurn({
                chatId: body.conversationId,
                userId,
                userInput: body.input,
                assistantOutput: accumulatedAssistantText,
                requestId,
              })
            } catch (persistError) {
              logger.error('Failed to persist workflow execution chat turn', {
                userId,
                chatId: body.conversationId,
                workflowId: body.workflowId,
                error: getErrorMessage(persistError),
              })
            }
          }

          if (!upstream.ok) {
            const errorText = await upstream.text().catch(() => '')
            logger.error('Workflow execution API returned non-OK status', {
              userId,
              workflowId: body.workflowId,
              status: upstream.status,
              authType: usedAuthType,
              executeUrl,
              error: errorText,
            })
            const userFacingError =
              upstream.status === 402
                ? 'This workflow could not run because of a billing restriction on API-key execution. Please refresh and try again.'
                : upstream.status === 401
                  ? 'Workflow authentication failed. Please refresh and try again.'
                  : 'Failed to execute workflow request. Please try again.'
            emitTextEvent(userFacingError)
            emitToolResultEvent({
              status: 'error',
              success: false,
              error: `Workflow request failed with status ${upstream.status}`,
              scope: runScope,
            })
            await persistBeforeComplete()
            emitEvent({
              v: 1,
              type: 'complete',
              seq: nextSeq(),
              ts: new Date().toISOString(),
              stream: { streamId, chatId, cursor: String(seq) },
              trace: { requestId },
              payload: { status: 'complete' },
            })
            return
          }

          if (!upstream.body) {
            logger.error('Workflow execution API returned empty stream body', {
              userId,
              workflowId: body.workflowId,
            })
            emitTextEvent('Workflow response stream was empty.')
            emitToolResultEvent({
              status: 'error',
              success: false,
              error: 'Workflow response stream was empty.',
              scope: runScope,
            })
            await persistBeforeComplete()
            emitEvent({
              v: 1,
              type: 'complete',
              seq: nextSeq(),
              ts: new Date().toISOString(),
              stream: { streamId, chatId, cursor: String(seq) },
              trace: { requestId },
              payload: { status: 'complete' },
            })
            return
          }

          reader = upstream.body.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const frames = buffer.split('\n\n')
            buffer = frames.pop() ?? ''
            for (const frame of frames) {
              processRawFrame(frame)
            }
          }

          const trailing = buffer.trim()
          processRawFrame(trailing)
          emitToolResultEvent({
            status: 'success',
            success: true,
            output: {
              message: 'Workflow execution completed.',
            },
            scope: runScope,
          })

          // Persist BEFORE `complete` so client finalize refetch sees messages.
          await persistBeforeComplete()

          emitEvent({
            v: 1,
            type: 'complete',
            seq: nextSeq(),
            ts: new Date().toISOString(),
            stream: { streamId, chatId, cursor: String(seq) },
            trace: { requestId },
            payload: { status: 'complete' },
          })
        } catch (error) {
          emitToolResultEvent({
            status: 'error',
            success: false,
            error: getErrorMessage(error),
            scope: runScope,
          })

          if (body.conversationId && accumulatedAssistantText.trim()) {
            try {
              await persistWorkflowChatTurn({
                chatId: body.conversationId,
                userId,
                userInput: body.input,
                assistantOutput: accumulatedAssistantText,
                requestId,
              })
            } catch (persistError) {
              logger.error('Failed to persist partial workflow execution chat turn', {
                userId,
                chatId: body.conversationId,
                workflowId: body.workflowId,
                error: getErrorMessage(persistError),
              })
            }
          }

          emitEvent({
            v: 1,
            type: 'complete',
            seq: nextSeq(),
            ts: new Date().toISOString(),
            stream: { streamId, chatId, cursor: String(seq) },
            trace: { requestId },
            payload: { status: 'complete' },
          })
          logger.error('Failed to transform upstream workflow stream', {
            userId,
            workflowId: body.workflowId,
            error: getErrorMessage(error),
          })
        } finally {
          stopStatusRotation()
          // OLD: persist-after-complete lived here and raced the UI refetch.
          if (reader) {
            try {
              await reader.cancel()
            } catch {}
          }
          controller.close()
        }
      },
    })

    return new Response(transformed, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    logger.error('Unexpected error executing workflow', {
      userId,
      workflowId: body.workflowId,
      error: getErrorMessage(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
