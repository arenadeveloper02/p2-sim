import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { parseRequest } from '@/lib/api/server'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { checkWorkspaceAccess } from '@/lib/workspaces/permissions/utils'
import { requireLocalCopilotAccess } from '@/local-copilot/lib/access'
import { listConversations } from '@/local-copilot/lib/persistence/store'
import { listLocalCopilotConversationsContract } from '@/local-copilot/contracts/local-copilot'

const logger = createLogger('LocalCopilotConversationsAPI')

export const GET = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accessDenied = requireLocalCopilotAccess(session.user.email)
  if (accessDenied) return accessDenied

  const parsed = await parseRequest(listLocalCopilotConversationsContract, request, {})
  if (!parsed.success) return parsed.response

  const { query } = parsed.data
  const access = await checkWorkspaceAccess(query.workspaceId, session.user.id)
  if (!access.hasAccess) {
    return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 })
  }

  const rows = await listConversations(session.user.id, query.workflowId)
  const conversations = rows
    .filter((row) => row.workspaceId === query.workspaceId)
    .map((row) => ({
      id: row.id,
      title: row.title,
      workflowId: row.workflowId,
      model: row.model,
      provider: row.provider,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }))

  logger.info('Listed Arena Copilot conversations', { count: conversations.length })

  return NextResponse.json({ conversations })
})
