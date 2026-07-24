import { db } from '@sim/db'
import { workflowExecutionLogs } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { verifyExecutionCostsContract } from '@/lib/api/contracts/logs'
import { parseRequest } from '@/lib/api/server'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import {
  computeShadowRepriceForExecution,
  toVerifyExecutionCostsResponse,
} from '@/lib/billing/core/historical-workflow-reconciliation'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { checkWorkspaceAccess } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('VerifyExecutionCostsAPI')

/**
 * Read-only shadow reprice for a single execution. Never writes to the ledger.
 * Always gates to the priced-tool allowlist (`onlyPricedTools: true`).
 */
export const POST = withRouteHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ executionId: string }> }
  ) => {
    const authResult = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || 'Authentication required' },
        { status: 401 }
      )
    }

    const parsed = await parseRequest(verifyExecutionCostsContract, request, context)
    if (!parsed.success) return parsed.response

    const { executionId } = parsed.data.params
    const authenticatedUserId = authResult.userId

    const [workflowLog] = await db
      .select({
        executionId: workflowExecutionLogs.executionId,
        workspaceId: workflowExecutionLogs.workspaceId,
      })
      .from(workflowExecutionLogs)
      .where(eq(workflowExecutionLogs.executionId, executionId))
      .limit(1)

    if (!workflowLog) {
      logger.warn('Execution not found for cost verify', { executionId })
      return NextResponse.json({ error: 'Workflow execution not found' }, { status: 404 })
    }

    const access = await checkWorkspaceAccess(workflowLog.workspaceId, authenticatedUserId)
    if (!access.hasAccess) {
      logger.warn('Execution access denied for cost verify', { executionId })
      return NextResponse.json({ error: 'Workflow execution not found' }, { status: 404 })
    }

    const record = await computeShadowRepriceForExecution(executionId, {
      onlyPricedTools: true,
    })

    if (!record) {
      logger.warn('Unable to load evidence for cost verify', { executionId })
      return NextResponse.json({ error: 'Workflow execution not found' }, { status: 404 })
    }

    logger.info('Verified execution costs (read-only)', {
      executionId,
      primaryClass: record.primaryClass,
      confidence: record.confidence,
      positiveDelta: record.positiveDelta,
      negativeDelta: record.negativeDelta,
    })

    return NextResponse.json(toVerifyExecutionCostsResponse(record))
  }
)
