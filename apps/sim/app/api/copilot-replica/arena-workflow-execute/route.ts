import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { appendCopilotLogContext } from '@/lib/copilot/logging'
import { env } from '@/lib/core/config/env'
import { getInternalApiBaseUrl } from '@/lib/core/utils/urls'
import { assertActiveWorkspaceAccess } from '@/lib/workspaces/permissions/utils'

export const maxDuration = 3600

const logger = createLogger('CopilotReplicaArenaProxy')

/** Default when `COPILOT_REPLICA_ARENA_WORKFLOW_EXECUTE_URL` is unset (dev-agent Arena). */
const DEFAULT_ARENA_WORKFLOW_EXECUTE_URL =
  'https://dev-agent.thearena.ai/api/workflows/9b814ba1-1ef8-4803-8b4a-bde5aa1e7968/execute'

const ClientBodySchema = z.object({
  message: z.string().min(1),
  workspaceId: z.string().min(1),
  userMessageId: z.string().optional(),
  createNewChat: z.boolean().optional(),
  chatId: z.string().optional(),
  userTimezone: z.string().optional(),
})

const ArenaJsonSchema = z.object({
  result: z.record(z.unknown()),
  stdout: z.string().optional(),
})

/**
 * POST /api/copilot-replica/arena-workflow-execute
 *
 * 1. Calls Arena workflow execute with `X-API-Key`.
 * 2. When the response is JSON `{ result, stdout }`, forwards to
 *    `POST /api/mothership/chat-v1` with `arenaWorkflowExecuteResponse` set so the copilot
 *    payload merges Arena output, then returns the **SSE** from chat-v1 to the client.
 * 3. Non-JSON responses are proxied as-is (legacy streaming).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const json = await req.json()
    const { message, workspaceId, userMessageId, createNewChat, chatId, userTimezone } =
      ClientBodySchema.parse(json)

    await assertActiveWorkspaceAccess(workspaceId, session.user.id)

    const targetUrl =
      env.COPILOT_REPLICA_ARENA_WORKFLOW_EXECUTE_URL?.trim() || DEFAULT_ARENA_WORKFLOW_EXECUTE_URL
    const apiKey = env.COPILOT_REPLICA_ARENA_API_KEY
    if (!apiKey) {
      logger.error(
        appendCopilotLogContext('Missing COPILOT_REPLICA_ARENA_API_KEY for Arena proxy', {}),
        { workspaceId }
      )
      return NextResponse.json(
        {
          error:
            'Server is not configured for Arena workflow execute (set COPILOT_REPLICA_ARENA_API_KEY).',
        },
        { status: 503 }
      )
    }

    const effectiveChatId = chatId ?? userMessageId ?? crypto.randomUUID()
    const conversationId = chatId ?? userMessageId ?? effectiveChatId

    const arenaBody = {
      message,
      conversationId,
      chatId: effectiveChatId,
      userId: session.user.id,
      newchat: Boolean(createNewChat),
      selectedOutputs: ['buildpayload.result'],
    }

    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(arenaBody),
    })

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      logger.warn(
        appendCopilotLogContext('Arena workflow execute returned non-OK', {}),
        {
          status: upstream.status,
          workspaceId,
          bodyPreview: text.slice(0, 500),
        }
      )
      const status =
        upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502
      return NextResponse.json(
        {
          error: upstream.statusText || 'Arena request failed',
          details: text.slice(0, 2000),
        },
        { status }
      )
    }

    const contentType = upstream.headers.get('content-type') ?? ''

    if (contentType.includes('application/json')) {
      const rawText = await upstream.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText) as unknown
      } catch {
        return NextResponse.json(
          { error: 'Arena returned invalid JSON', details: rawText.slice(0, 500) },
          { status: 502 }
        )
      }

      const arenaPayload = ArenaJsonSchema.safeParse(parsed)
      if (!arenaPayload.success) {
        return NextResponse.json(
          { error: 'Arena JSON missing result', details: arenaPayload.error.flatten() },
          { status: 502 }
        )
      }

      const userMessageIdForChain = userMessageId ?? crypto.randomUUID()
      const chatV1Body = {
        userId: session.user.id,
        message,
        workspaceId,
        userMessageId: userMessageIdForChain,
        createNewChat: Boolean(createNewChat),
        ...(chatId ? { chatId } : {}),
        ...(userTimezone ? { userTimezone } : {}),
        arenaWorkflowExecuteResponse: arenaPayload.data,
      }

      const internalBase = getInternalApiBaseUrl()
      const chatV1Url = `${internalBase}/api/mothership/chat-v1`

      const cookieHeader = req.headers.get('cookie') ?? ''

      const chatV1Res = await fetch(chatV1Url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        body: JSON.stringify(chatV1Body),
      })

      if (!chatV1Res.ok) {
        const errText = await chatV1Res.text().catch(() => '')
        logger.error(
          appendCopilotLogContext('chat-v1 forward after Arena failed', {}),
          { status: chatV1Res.status, preview: errText.slice(0, 500) }
        )
        return NextResponse.json(
          {
            error: 'Mothership chat-v1 failed after Arena',
            status: chatV1Res.status,
            details: errText.slice(0, 2000),
          },
          { status: chatV1Res.status >= 400 ? chatV1Res.status : 502 }
        )
      }

      if (!chatV1Res.body) {
        return NextResponse.json({ error: 'chat-v1 returned empty body' }, { status: 502 })
      }

      const outType = chatV1Res.headers.get('content-type') ?? 'text/event-stream'

      return new Response(chatV1Res.body, {
        headers: {
          'Content-Type': outType,
          'Cache-Control': 'no-cache, no-transform',
          'Content-Encoding': 'none',
        },
      })
    }

    if (!upstream.body) {
      return NextResponse.json(
        { error: 'Arena returned an empty response body' },
        { status: 502 }
      )
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentType || 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Content-Encoding': 'none',
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }
    logger.error(appendCopilotLogContext('Arena workflow execute proxy error', {}), error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
