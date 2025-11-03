import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getEnv } from '@/lib/env'
import { createLogger } from '@/lib/logs/console/logger'
import { db } from '@/db'
import { apiKey, userStats, workflow as workflowTable } from '@/db/schema'
import type { ExecutionResult } from '@/executor/types'

// Re-export hasWorkflowChanged from comparison.ts for backwards compatibility
export { hasWorkflowChanged } from './comparison'

const logger = createLogger('WorkflowUtils')

export async function getWorkflowById(id: string) {
  const workflows = await db
    .select({
      id: workflowTable.id,
      userId: workflowTable.userId,
      workspaceId: workflowTable.workspaceId,
      folderId: workflowTable.folderId,
      name: workflowTable.name,
      description: workflowTable.description,
      color: workflowTable.color,
      lastSynced: workflowTable.lastSynced,
      createdAt: workflowTable.createdAt,
      updatedAt: workflowTable.updatedAt,
      isDeployed: workflowTable.isDeployed,
      deployedState: workflowTable.deployedState,
      deployedAt: workflowTable.deployedAt,
      pinnedApiKeyId: workflowTable.pinnedApiKeyId,
      collaborators: workflowTable.collaborators,
      runCount: workflowTable.runCount,
      lastRunAt: workflowTable.lastRunAt,
      variables: workflowTable.variables,
      isPublished: workflowTable.isPublished,
      marketplaceData: workflowTable.marketplaceData,
      pinnedApiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key,
        type: apiKey.type,
        workspaceId: apiKey.workspaceId,
      },
    })
    .from(workflowTable)
    .leftJoin(apiKey, eq(workflowTable.pinnedApiKeyId, apiKey.id))
    .where(eq(workflowTable.id, id))
    .limit(1)

  return workflows[0]
}

export async function updateWorkflowRunCounts(workflowId: string, runs = 1) {
  try {
    const workflow = await getWorkflowById(workflowId)
    if (!workflow) {
      logger.error(`Workflow ${workflowId} not found`)
      throw new Error(`Workflow ${workflowId} not found`)
    }

    // Get the origin from the environment or use direct DB update as fallback
    const origin =
      getEnv('NEXT_PUBLIC_APP_URL') || (typeof window !== 'undefined' ? window.location.origin : '')

    if (origin) {
      // Use absolute URL with origin
      const response = await fetch(`${origin}/api/workflows/${workflowId}/stats?runs=${runs}`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update workflow stats')
      }

      return response.json()
    }
    logger.warn('No origin available, updating workflow stats directly via DB')

    // Update workflow directly through database
    await db
      .update(workflowTable)
      .set({
        runCount: (workflow.runCount as number) + runs,
        lastRunAt: new Date(),
      })
      .where(eq(workflowTable.id, workflowId))

    // Update user stats if needed
    if (workflow.userId) {
      const userStatsRecord = await db
        .select()
        .from(userStats)
        .where(eq(userStats.userId, workflow.userId))
        .limit(1)

      if (userStatsRecord.length === 0) {
        console.warn('User stats record not found - should be created during onboarding', {
          userId: workflow.userId,
        })
        return // Skip stats update if record doesn't exist
      }
      // Update existing record
      await db
        .update(userStats)
        .set({
          totalManualExecutions: userStatsRecord[0].totalManualExecutions + runs,
          lastActive: new Date(),
        })
        .where(eq(userStats.userId, workflow.userId))
    }

    return { success: true, runsAdded: runs }
  } catch (error) {
    logger.error('Error updating workflow run counts:', error)
    throw error
  }
}

export function stripCustomToolPrefix(name: string) {
  return name.startsWith('custom_') ? name.replace('custom_', '') : name
}

export const workflowHasResponseBlock = (executionResult: ExecutionResult): boolean => {
  if (
    !executionResult?.logs ||
    !Array.isArray(executionResult.logs) ||
    !executionResult.success ||
    !executionResult.output.response
  ) {
    return false
  }

  const responseBlock = executionResult.logs.find(
    (log) => log?.blockType === 'response' && log?.success
  )

  return responseBlock !== undefined
}

// Create a HTTP response from response block
export const createHttpResponseFromBlock = (executionResult: ExecutionResult): NextResponse => {
  const output = executionResult.output.response
  const { data = {}, status = 200, headers = {} } = output

  const responseHeaders = new Headers({
    'Content-Type': 'application/json',
    ...headers,
  })

  return NextResponse.json(data, {
    status: status,
    headers: responseHeaders,
  })
}
