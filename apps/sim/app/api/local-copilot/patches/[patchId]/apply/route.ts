import { db } from '@sim/db'
import { workflow } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import type { WorkflowState } from '@sim/workflow-types/workflow'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { parseRequest } from '@/lib/api/server'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { loadWorkflowFromNormalizedTables } from '@/lib/workflows/persistence/utils'
import { logCopilotAction } from '@/local-copilot/lib/audit/logger'
import { applyWorkflowPatch } from '@/local-copilot/lib/patches/apply'
import { getConversation, getPatch } from '@/local-copilot/lib/persistence/store'
import { applyLocalCopilotPatchContract } from '@/local-copilot/contracts/local-copilot'

const logger = createLogger('LocalCopilotPatchApplyAPI')

export const POST = withRouteHandler(
  async (request: NextRequest, { params }: { params: Promise<{ patchId: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const routeParams = await params
    const parsed = await parseRequest(applyLocalCopilotPatchContract, request, {
      params: routeParams,
    })
    if (!parsed.success) return parsed.response

    const patchRow = await getPatch(parsed.data.params.patchId, session.user.id)
    if (!patchRow) {
      return NextResponse.json({ error: 'Patch not found' }, { status: 404 })
    }

    const conversation = await getConversation(patchRow.conversationId, session.user.id)
    const currentState = await loadWorkflowFromNormalizedTables(parsed.data.body.workflowId)
    if (!currentState) {
      return NextResponse.json({ success: false, errors: ['Workflow not found'] }, { status: 404 })
    }

    const [workflowMeta] = await db
      .select({ variables: workflow.variables })
      .from(workflow)
      .where(eq(workflow.id, parsed.data.body.workflowId))
      .limit(1)

    const workflowState: WorkflowState = {
      blocks: currentState.blocks,
      edges: currentState.edges,
      loops: currentState.loops,
      parallels: currentState.parallels,
      variables: (workflowMeta?.variables ?? {}) as WorkflowState['variables'],
    }

    const result = await applyWorkflowPatch({
      patchId: parsed.data.params.patchId,
      userId: session.user.id,
      workflowId: parsed.data.body.workflowId,
      currentState: workflowState,
    })

    await logCopilotAction({
      userId: session.user.id,
      workspaceId: conversation?.workspaceId ?? '',
      workflowId: parsed.data.body.workflowId,
      conversationId: patchRow.conversationId,
      patchId: parsed.data.params.patchId,
      action: 'apply_patch',
      summary: patchRow.summary,
      status: result.success ? 'success' : 'failure',
      metadata: { errors: result.errors },
    })

    logger.info('Apply patch result', {
      patchId: parsed.data.params.patchId,
      success: result.success,
    })

    return NextResponse.json({
      success: result.success,
      errors: result.errors,
    })
  }
)
