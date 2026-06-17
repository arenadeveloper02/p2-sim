import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { timingSafeEqual } from 'crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { env } from '@/lib/core/config/env'
import type { ToolExecutionContext } from '@/lib/copilot/tool-executor/types'
import { getEffectiveDecryptedEnv } from '@/lib/environment/utils'
import { executeP2Tool } from '@/lib/p2-copilot/tools/registry'

const logger = createLogger('P2CopilotToolExecute')

const ExecuteSchema = z.object({
  toolName: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional(),
  context: z.object({
    userId: z.string().min(1),
    workflowId: z.string().optional(),
    workspaceId: z.string().optional(),
    chatId: z.string().optional(),
  }),
})

const INTERNAL_SECRET_HEADER = 'x-internal-secret'

function isAuthorized(req: NextRequest): boolean {
  const provided = req.headers.get(INTERNAL_SECRET_HEADER)
  const expected = env.INTERNAL_API_SECRET
  if (!provided || !expected) return false

  const providedBuf = Buffer.from(provided)
  const expectedBuf = Buffer.from(expected)
  if (providedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(providedBuf, expectedBuf)
}

/**
 * Tool execution endpoint called by the P2 brain.
 *
 * The brain runs the model and decides which tool to call, then posts here so
 * the actual execution happens inside Sim with real auth/env/permissions. The
 * shared INTERNAL_API_SECRET is the trust boundary between the two processes.
 */
export async function handleP2ToolExecute(req: NextRequest): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let parsed: z.infer<typeof ExecuteSchema>
  try {
    parsed = ExecuteSchema.parse(await req.json())
  } catch (error) {
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Invalid tool request') },
      { status: 400 }
    )
  }

  const { toolName, args, context: ctx } = parsed

  try {
    const decryptedEnvVars = await getEffectiveDecryptedEnv(ctx.userId, ctx.workspaceId).catch(
      () => ({}) as Record<string, string>
    )

    const executionContext: ToolExecutionContext = {
      userId: ctx.userId,
      workflowId: ctx.workflowId ?? '',
      workspaceId: ctx.workspaceId,
      chatId: ctx.chatId,
      copilotToolExecution: true,
      requestMode: 'agent',
      decryptedEnvVars,
    }

    const result = await executeP2Tool(toolName, args ?? {}, executionContext)

    return NextResponse.json({
      success: result.success,
      result: result.output,
      error: result.error,
    })
  } catch (error) {
    logger.error('P2 tool execution failed', {
      tool: toolName,
      error: getErrorMessage(error, 'Unknown error'),
    })
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Tool execution failed') },
      { status: 500 }
    )
  }
}
