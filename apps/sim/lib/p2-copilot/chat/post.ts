import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { generateId } from '@sim/utils/id'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/core/config/env'
import { buildWorkflowContext } from '@/lib/p2-copilot/context/workflow-context'
import { selectModel } from '@/lib/p2-copilot/models/select'
import { getToolSchemas } from '@/lib/p2-copilot/tools/registry'
import { resolveWorkflowIdForUser } from '@/lib/workflows/utils'

export const maxDuration = 3600

const logger = createLogger('P2CopilotChatAPI')

const DEFAULT_BRAIN_URL = 'http://localhost:3010'

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  messages: z.array(MessageSchema).optional(),
  workflowId: z.string().optional(),
  workspaceId: z.string().optional(),
  workflowName: z.string().optional(),
  chatId: z.string().optional(),
})

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const

function resolveSimOrigin(req: NextRequest): string {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL.replace(/\/$/, '')
  return new URL(req.url).origin
}

/**
 * P2 copilot chat entry point.
 *
 * Mirrors the mothership flow at a high level (auth → resolve scope → build
 * context → stream) but routes to our own brain service instead of the remote
 * Go mothership, and never touches lib/copilot code paths.
 */
export async function handleP2ChatPost(req: NextRequest): Promise<Response> {
  const requestId = generateId()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    const body = ChatRequestSchema.parse(await req.json())

    let workflowId = body.workflowId
    let workspaceId = body.workspaceId
    let workflowName = body.workflowName

    if (workflowId || body.workflowName) {
      const resolved = await resolveWorkflowIdForUser(
        userId,
        workflowId,
        body.workflowName,
        workspaceId
      )
      if (resolved.status !== 'resolved') {
        return NextResponse.json({ error: resolved.message }, { status: 400 })
      }
      workflowId = resolved.workflowId
      workspaceId = resolved.workspaceId
      workflowName = resolved.workflowName
    }

    const model = selectModel()
    if (!model) {
      return NextResponse.json(
        {
          error:
            'No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in your environment to use P2 Copilot.',
        },
        { status: 400 }
      )
    }

    const systemContext = await buildWorkflowContext({ workflowId, workspaceId, workflowName })
    const tools = getToolSchemas()

    const history = body.messages ?? []
    const brainRequest = {
      requestId,
      provider: model.provider,
      model: model.model,
      apiKey: model.apiKey,
      systemContext,
      messages: [...history, { role: 'user' as const, content: body.message }],
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
      toolExec: {
        url: `${resolveSimOrigin(req)}/api/p2-copilot/tools/execute`,
        secret: env.INTERNAL_API_SECRET ?? '',
        context: {
          userId,
          workflowId: workflowId ?? '',
          workspaceId: workspaceId ?? undefined,
          chatId: body.chatId,
        },
      },
    }

    const brainUrl = (env.P2_COPILOT_BRAIN_URL ?? DEFAULT_BRAIN_URL).replace(/\/$/, '')

    logger.info(`[${requestId}] Dispatching to P2 brain`, {
      provider: model.provider,
      model: model.model,
      toolCount: tools.length,
      workflowId,
    })

    const brainResponse = await fetch(`${brainUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(brainRequest),
    })

    if (!brainResponse.ok || !brainResponse.body) {
      const detail = await brainResponse.text().catch(() => '')
      logger.error(`[${requestId}] Brain returned error`, { status: brainResponse.status, detail })
      return NextResponse.json(
        { error: `P2 brain unavailable (status ${brainResponse.status}). Is the brain service running?` },
        { status: 502 }
      )
    }

    return new Response(brainResponse.body, { headers: SSE_HEADERS })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 })
    }
    logger.error(`[${requestId}] P2 chat request failed`, {
      error: getErrorMessage(error, 'Unknown error'),
    })
    return NextResponse.json(
      { error: getErrorMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
