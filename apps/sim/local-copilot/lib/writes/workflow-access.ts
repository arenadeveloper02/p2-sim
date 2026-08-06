import { db } from '@sim/db'
import { workflow } from '@sim/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { revisionFromDate } from '@/local-copilot/lib/writes/revision'
import { assertWorkflowInWorkspace } from '@/local-copilot/lib/writes/pin-ids'

/**
 * Loads the CAS revision token for a workflow in a workspace.
 */
export async function loadWorkflowRevision(
  workflowId: string,
  workspaceId: string
): Promise<{ revision: string; workspaceId: string } | null> {
  const [row] = await db
    .select({
      updatedAt: workflow.updatedAt,
      workspaceId: workflow.workspaceId,
    })
    .from(workflow)
    .where(and(eq(workflow.id, workflowId), isNull(workflow.archivedAt)))
    .limit(1)

  if (!row?.workspaceId) return null
  if (row.workspaceId !== workspaceId) return null
  return {
    revision: revisionFromDate(row.updatedAt),
    workspaceId: row.workspaceId,
  }
}

/**
 * Validates workflow tenancy for a write.
 */
export async function assertWorkflowWritableInWorkspace(params: {
  workflowId: string
  workspaceId: string
  allowedWorkflowIds?: Set<string>
}): Promise<{ ok: true; revision: string } | { ok: false; error: string }> {
  if (params.allowedWorkflowIds?.has(params.workflowId)) {
    const loaded = await loadWorkflowRevision(params.workflowId, params.workspaceId)
    if (!loaded) {
      // Just-created workflows may not be visible yet; allow with empty revision gate.
      return { ok: true, revision: '' }
    }
    return { ok: true, revision: loaded.revision }
  }

  const loaded = await loadWorkflowRevision(params.workflowId, params.workspaceId)
  const membership = assertWorkflowInWorkspace({
    workflowId: params.workflowId,
    workspaceId: params.workspaceId,
    workflowWorkspaceId: loaded?.workspaceId,
    allowedWorkflowIds: params.allowedWorkflowIds,
  })
  if (!membership.ok) return membership
  if (!loaded) return { ok: false, error: 'Workflow not found in this workspace' }
  return { ok: true, revision: loaded.revision }
}
