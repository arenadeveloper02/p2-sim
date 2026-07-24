import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { checkWorkspaceAccess } from '@/lib/workspaces/permissions/utils'
import { localCopilotChatContract } from '@/local-copilot/contracts/local-copilot'
import { requireLocalCopilotAccess } from '@/local-copilot/lib/access'
import { formatSSE, runLocalCopilotAgent } from '@/local-copilot/lib/agent/orchestrator'
import { getLocalCopilotConfig } from '@/local-copilot/lib/config'

const logger = createLogger('LocalCopilotChatAPI')

export const POST = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accessDenied = await requireLocalCopilotAccess(session.user.id)
  if (accessDenied) return accessDenied

  const parsed = await parseRequest(localCopilotChatContract, request, {})
  if (!parsed.success) return parsed.response

  const { body } = parsed.data
  const access = await checkWorkspaceAccess(body.workspaceId, session.user.id)
  if (!access.hasAccess) {
    return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  }

  const userPermission = access.canAdmin ? 'admin' : access.canWrite ? 'write' : 'read'

  const config = getLocalCopilotConfig()
  const abortController = new AbortController()
  request.signal.addEventListener('abort', () => abortController.abort())

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const event of runLocalCopilotAgent({
          userId: session.user.id,
          workspaceId: body.workspaceId,
          workflowId: body.workflowId,
          message: body.message,
          conversationId: body.conversationId,
          selectedBlockId: body.selectedBlockId,
          executionId: body.executionId,
          userPermission,
          signal: abortController.signal,
        })) {
          controller.enqueue(encoder.encode(formatSSE(event)))
        }
      } catch (error) {
        logger.error('Arena Copilot stream error', { error: getErrorMessage(error) })
        controller.enqueue(
          encoder.encode(
            formatSSE({ type: 'error', message: getErrorMessage(error, 'Stream failed') })
          )
        )
      } finally {
        controller.close()
      }
    },
  })

  logger.info('Starting Arena Copilot stream', {
    workflowId: body.workflowId,
    provider: config.provider,
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
})
