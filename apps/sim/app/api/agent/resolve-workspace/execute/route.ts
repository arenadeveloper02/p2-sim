import { db } from '@sim/db'
import { copilotChats } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, sql } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { normalizeMessage, type PersistedMessage } from '@/lib/copilot/chat/persisted-message'
import { generateRequestId } from '@/lib/core/utils/request'

const logger = createLogger('AgentResolveWorkspaceExecute')

const ExecuteRequestSchema = z.object({
  workflowId: z.string().uuid(),
  input: z.string().min(1),
  conversationId: z.string().optional(),
  selectedOutputs: z.array(z.string()).default([]),
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  payload: {
    channel: 'assistant'
    text: string
  }
}

type SessionEnvelope = {
  v: 1
  type: 'session'
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
  payload: {
    kind: 'chat'
    chatId: string
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
  payload: {
    toolCallId: string
    toolName: 'run'
    phase: 'args_delta' | 'call' | 'result'
    argumentsDelta?: string
    arguments?: {
      request: string
    }
    executor?: 'sim'
    mode?: 'async'
    status?: 'executing' | 'complete'
  }
}

type SpanEnvelope = {
  v: 1
  type: 'span'
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
  scope: {
    lane: 'subagent'
    agentId: 'run'
    parentToolCallId: string
  }
  payload: {
    kind: 'subagent'
    event: 'start' | 'end'
    agent: 'run'
    data?: {
      input: string
      tool_call_id: string
    }
  }
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

  const nestedKeys = ['payload', 'data', 'result', 'event'] as const
  for (const key of nestedKeys) {
    const nested = extractFirstString(record[key])
    if (nested) return nested
  }

  return undefined
}

function extractTextFromUpstreamData(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '[DONE]') return ''

  try {
    const parsed = JSON.parse(trimmed) as unknown
    return extractFirstString(parsed) ?? ''
  } catch {
    return trimmed
  }
}

function toSseDataLine(
  event: TextEnvelope | SessionEnvelope | CompleteEnvelope | ToolEnvelope | SpanEnvelope
): string {
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

  await db
    .update(copilotChats)
    .set({
      messages:
        sql`${copilotChats.messages} || ${JSON.stringify([userMessage, assistantMessage])}::jsonb`,
      conversationId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(copilotChats.id, chatId),
        eq(copilotChats.userId, userId),
        eq(copilotChats.type, 'mothership')
      )
    )
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    logger.warn('Unauthorized workflow execution request — no active session')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const apiKey = 'sim_DA2rdcceubED50_JKwTuMjw2lhX60DsO'
  if (!apiKey) {
    logger.error('SIM_WORKFLOW_API_KEY is not configured — cannot execute workflow')
    return NextResponse.json({ error: 'Agent API not configured' }, { status: 500 })
  }

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

  const executeUrl = `https://dev-agent.thearena.ai/api/workflows/${body.workflowId}/execute`

  try {
    const upstream = await fetch(executeUrl, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: body.input,
        ...(body.conversationId ? { conversationId: body.conversationId } : {}),
        stream: true,
        selectedOutputs: body.selectedOutputs,
      }),
    })

    if (!upstream.ok) {
      const errorText = await upstream.text().catch(() => '')
      logger.error('Workflow execution API returned non-OK status', {
        userId,
        workflowId: body.workflowId,
        status: upstream.status,
        error: errorText,
      })
      return NextResponse.json(
        { error: 'Failed to execute workflow' },
        { status: upstream.status }
      )
    }

    if (!upstream.body) {
      logger.error('Workflow execution API returned empty stream body', {
        userId,
        workflowId: body.workflowId,
      })
      return NextResponse.json({ error: 'Empty workflow stream' }, { status: 502 })
    }

    const streamId = generateRequestId()
    const requestId = generateRequestId()
    const chatId = body.conversationId ?? streamId

    const transformed = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.body!.getReader()
        const decoder = new TextDecoder()
        const encoder = new TextEncoder()
        let buffer = ''
        let sawSsePrefix = false
        let seq = 0
        let accumulatedAssistantText = ''
        const toolCallId = generateRequestId()

        const emitEvent = (
          event: TextEnvelope | SessionEnvelope | CompleteEnvelope | ToolEnvelope | SpanEnvelope
        ) => {
          controller.enqueue(encoder.encode(toSseDataLine(event)))
        }

        const nextSeq = () => {
          seq += 1
          return seq
        }

        emitEvent({
          v: 1,
          type: 'session',
          seq: nextSeq(),
          ts: new Date().toISOString(),
          stream: { streamId, chatId, cursor: String(seq) },
          trace: { requestId },
          payload: { kind: 'chat', chatId },
        })
        emitEvent({
          v: 1,
          type: 'tool',
          seq: nextSeq(),
          ts: new Date().toISOString(),
          stream: { streamId, chatId, cursor: String(seq) },
          trace: { requestId },
          payload: {
            toolCallId,
            toolName: 'run',
            phase: 'args_delta',
            argumentsDelta: '',
            executor: 'sim',
            mode: 'async',
          },
        })
        emitEvent({
          v: 1,
          type: 'tool',
          seq: nextSeq(),
          ts: new Date().toISOString(),
          stream: { streamId, chatId, cursor: String(seq) },
          trace: { requestId },
          payload: {
            toolCallId,
            toolName: 'run',
            phase: 'call',
            arguments: { request: body.input },
            executor: 'sim',
            mode: 'async',
            status: 'executing',
          },
        })
        emitEvent({
          v: 1,
          type: 'span',
          seq: nextSeq(),
          ts: new Date().toISOString(),
          stream: { streamId, chatId, cursor: String(seq) },
          trace: { requestId },
          scope: {
            lane: 'subagent',
            agentId: 'run',
            parentToolCallId: toolCallId,
          },
          payload: {
            kind: 'subagent',
            event: 'start',
            agent: 'run',
            data: {
              input: body.input,
              tool_call_id: toolCallId,
            },
          },
        })

        const emitTextEvent = (text: string) => {
          if (!text) return
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
            scope: {
              lane: 'subagent',
              agentId: 'run',
              parentToolCallId: toolCallId,
            },
            payload: {
              channel: 'assistant',
              text,
            },
          }
          emitEvent(event)
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
            const text = extractTextFromUpstreamData(mergedData)
            emitTextEvent(text)
            return
          }

          if (!sawSsePrefix) {
            const text = extractTextFromUpstreamData(frame)
            emitTextEvent(text)
          }
        }

        try {
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
          emitEvent({
            v: 1,
            type: 'span',
            seq: nextSeq(),
            ts: new Date().toISOString(),
            stream: { streamId, chatId, cursor: String(seq) },
            trace: { requestId },
            scope: {
              lane: 'subagent',
              agentId: 'run',
              parentToolCallId: toolCallId,
            },
            payload: {
              kind: 'subagent',
              event: 'end',
              agent: 'run',
            },
          })
          emitEvent({
            v: 1,
            type: 'tool',
            seq: nextSeq(),
            ts: new Date().toISOString(),
            stream: { streamId, chatId, cursor: String(seq) },
            trace: { requestId },
            payload: {
              toolCallId,
              toolName: 'run',
              phase: 'result',
              executor: 'sim',
              mode: 'async',
              status: 'complete',
            },
          })
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
          logger.error('Failed to transform upstream workflow stream', {
            userId,
            workflowId: body.workflowId,
            error: error instanceof Error ? error.message : String(error),
          })
        } finally {
          if (body.conversationId) {
            try {
              await persistWorkflowChatTurn({
                chatId: body.conversationId,
                userId,
                userInput: body.input,
                assistantOutput: accumulatedAssistantText,
                requestId,
              })
            } catch (error) {
              logger.error('Failed to persist workflow execution chat turn', {
                userId,
                chatId: body.conversationId,
                workflowId: body.workflowId,
                error: error instanceof Error ? error.message : String(error),
              })
            }
          }
          try {
            await reader.cancel()
          } catch {}
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
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
