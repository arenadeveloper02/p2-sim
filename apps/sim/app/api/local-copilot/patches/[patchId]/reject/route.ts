import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { parseRequest } from '@/lib/api/server'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { requireLocalCopilotAccess } from '@/local-copilot/lib/access'
import { logCopilotAction } from '@/local-copilot/lib/audit/logger'
import { rejectWorkflowPatch } from '@/local-copilot/lib/patches/apply'
import { getConversation, getPatch } from '@/local-copilot/lib/persistence/store'
import { rejectLocalCopilotPatchContract } from '@/local-copilot/contracts/local-copilot'

const logger = createLogger('LocalCopilotPatchRejectAPI')

export const POST = withRouteHandler(
  async (request: NextRequest, { params }: { params: Promise<{ patchId: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessDenied = requireLocalCopilotAccess(session.user.email)
    if (accessDenied) return accessDenied

    const routeParams = await params
    const parsed = await parseRequest(rejectLocalCopilotPatchContract, request, {
      params: routeParams,
    })
    if (!parsed.success) return parsed.response

    const patchRow = await getPatch(parsed.data.params.patchId, session.user.id)
    if (!patchRow) {
      return NextResponse.json({ error: 'Patch not found' }, { status: 404 })
    }

    const success = await rejectWorkflowPatch(parsed.data.params.patchId, session.user.id)

    const conversation = await getConversation(patchRow.conversationId, session.user.id)

    await logCopilotAction({
      userId: session.user.id,
      workspaceId: conversation?.workspaceId ?? '',
      workflowId: patchRow.workflowId,
      conversationId: patchRow.conversationId,
      patchId: parsed.data.params.patchId,
      action: 'reject_patch',
      summary: patchRow.summary,
      status: 'rejected',
    })

    logger.info('Rejected patch', { patchId: parsed.data.params.patchId, success })

    return NextResponse.json({ success })
  }
)
