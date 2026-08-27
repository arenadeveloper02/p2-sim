import { db } from '@sim/db'
import { workflow } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import type { WorkflowState } from '@sim/workflow-types/workflow'
import { eq } from 'drizzle-orm'
import { loadWorkflowFromNormalizedTables } from '@/lib/workflows/persistence/utils'
import { oauthIntegrationsToCredentialMetadata } from '@/local-copilot/lib/context/load-workspace-integrations'
import type { LocalCopilotStructuredContext } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotWorkflowReload')

interface ReloadedWorkflowGraph {
  id: string
  name: string
  blocks: WorkflowState['blocks']
  edges: WorkflowState['edges']
  variables: WorkflowState['variables']
  loops: WorkflowState['loops']
  parallels: WorkflowState['parallels']
}

/**
 * Merges a freshly loaded workflow graph into the previous turn context
 * without replacing workspace inventory, integrations, or execution logs.
 */
export function mergeReloadedWorkflowIntoContext(
  previous: LocalCopilotStructuredContext,
  loaded: ReloadedWorkflowGraph
): LocalCopilotStructuredContext {
  const credentials =
    previous.workflow?.id === loaded.id
      ? (previous.workflow.credentials ?? [])
      : oauthIntegrationsToCredentialMetadata(previous.connectedIntegrations)

  const existing = previous.workspaceWorkflows ?? []
  const workspaceWorkflows = existing.some((row) => row.id === loaded.id)
    ? existing.map((row) => (row.id === loaded.id ? { ...row, name: loaded.name } : row))
    : [{ id: loaded.id, name: loaded.name, isDeployed: false }, ...existing]

  return {
    ...previous,
    workspaceWorkflows,
    workflow: {
      id: loaded.id,
      name: loaded.name,
      blocks: loaded.blocks,
      edges: loaded.edges,
      variables: loaded.variables,
      loops: loaded.loops,
      parallels: loaded.parallels,
      credentials,
    },
  }
}

/**
 * Reloads only the workflow graph after a mutation. Skips snapshot, logs,
 * integrations, and memory queries that hammer Postgres on every tool call.
 */
export async function reloadLocalCopilotWorkflowContext(params: {
  previous: LocalCopilotStructuredContext
  workflowId?: string
  selectedBlockId?: string
}): Promise<LocalCopilotStructuredContext> {
  const next =
    params.selectedBlockId !== undefined
      ? { ...params.previous, selectedBlockId: params.selectedBlockId }
      : params.previous

  if (!params.workflowId) return next

  const loaded = await loadWorkflowGraph(params.workflowId)
  if (!loaded) {
    logger.warn('Workflow slice reload missed; keeping previous context', {
      workflowId: params.workflowId,
    })
    return next
  }

  return mergeReloadedWorkflowIntoContext(next, loaded)
}

async function loadWorkflowGraph(workflowId: string): Promise<ReloadedWorkflowGraph | null> {
  const [workflowRow] = await db
    .select({
      id: workflow.id,
      name: workflow.name,
      variables: workflow.variables,
    })
    .from(workflow)
    .where(eq(workflow.id, workflowId))
    .limit(1)

  if (!workflowRow) return null

  const normalized = await loadWorkflowFromNormalizedTables(workflowId)
  if (!normalized) return null

  return {
    id: workflowRow.id,
    name: workflowRow.name ?? 'Untitled workflow',
    blocks: normalized.blocks,
    edges: normalized.edges,
    variables: (workflowRow.variables ?? {}) as WorkflowState['variables'],
    loops: normalized.loops,
    parallels: normalized.parallels,
  }
}
