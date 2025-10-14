import { and, desc, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'
import { db } from '@/db'
import { workflowExecutionLogs } from '@/db/schema'

const logger = createLogger('ExecutionIdLookupAPI')

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const session = await getSession()
    const messageId = (await params).messageId
    const { searchParams } = new URL(request.url)
    const workflowId = searchParams.get('workflowId')
    const messageTimestamp = searchParams.get('timestamp')

    if (!session?.user?.id) {
      return createErrorResponse('Unauthorized', 401)
    }

    if (!workflowId) {
      return createErrorResponse('Workflow ID is required', 400)
    }

    if (!messageTimestamp) {
      return createErrorResponse('Message timestamp is required', 400)
    }

    // Look up the most recent execution for this workflow that might be related to this message
    const messageTime = new Date(messageTimestamp)
    const timeWindow = 5 * 60 * 1000 // 5 minutes window

    const executions = await db
      .select({
        executionId: workflowExecutionLogs.executionId,
        startedAt: workflowExecutionLogs.startedAt,
        trigger: workflowExecutionLogs.trigger,
      })
      .from(workflowExecutionLogs)
      .where(
        and(
          eq(workflowExecutionLogs.workflowId, workflowId),
          eq(workflowExecutionLogs.trigger, 'chat')
        )
      )
      .orderBy(desc(workflowExecutionLogs.startedAt))
      .limit(10)

    // Find the execution that's closest to the message time
    let closestExecution = null
    let minTimeDiff = Number.POSITIVE_INFINITY

    for (const execution of executions) {
      const executionTime = new Date(execution.startedAt)
      const timeDiff = Math.abs(messageTime.getTime() - executionTime.getTime())

      if (timeDiff < timeWindow && timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff
        closestExecution = execution
      }
    }

    if (closestExecution) {
      return createSuccessResponse({
        executionId: closestExecution.executionId,
      })
    }
    return createSuccessResponse({
      executionId: null,
    })
  } catch (error: any) {
    logger.error('Error looking up executionId for message:', error)
    return createErrorResponse(error.message || 'Failed to lookup executionId', 500)
  }
}
