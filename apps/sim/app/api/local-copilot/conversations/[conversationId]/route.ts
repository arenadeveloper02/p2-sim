import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { getLocalCopilotConversationContract } from '@/local-copilot/contracts/local-copilot'
import { requireLocalCopilotAccess } from '@/local-copilot/lib/access'
import { getConversation, getMessages } from '@/local-copilot/lib/persistence/store'

const logger = createLogger('LocalCopilotConversationAPI')

export const GET = withRouteHandler(
  async (request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessDenied = await requireLocalCopilotAccess(session.user.id)
    if (accessDenied) return accessDenied

    const routeParams = await params
    const parsed = await parseRequest(getLocalCopilotConversationContract, request, {
      params: routeParams,
    })
    if (!parsed.success) return parsed.response

    const conversation = await getConversation(parsed.data.params.conversationId, session.user.id)
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const messages = await getMessages(conversation.id)

    logger.info('Fetched Arena Copilot conversation', { conversationId: conversation.id })

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        workflowId: conversation.workflowId,
        model: conversation.model,
        provider: conversation.provider,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      },
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content as { text: string; patchId?: string; recommendations?: string[] },
        seq: message.seq,
        createdAt: message.createdAt.toISOString(),
      })),
    })
  }
)
