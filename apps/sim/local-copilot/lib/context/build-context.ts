import { db } from '@sim/db'
import { workspace, workflow } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { desc, eq } from 'drizzle-orm'
import type { WorkflowState } from '@sim/workflow-types/workflow'
import { getAllBlocks } from '@/blocks/registry'
import type { BlockConfig } from '@/blocks/types'
import { listLogs } from '@/lib/logs/list-logs'
import { loadWorkflowFromNormalizedTables } from '@/lib/workflows/persistence/utils'
import { sanitizeForExport } from '@/lib/workflows/sanitization/json-sanitizer'
import { getAccessibleOAuthCredentials } from '@/lib/credentials/environment'
import { isSelfHostedDeployment, getLocalCopilotConfig } from '@/local-copilot/lib/config'
import { sanitizeForLlm } from '@/local-copilot/lib/security/sanitize'
import type {
  LocalCopilotBlockSummary,
  LocalCopilotCredentialMetadata,
  LocalCopilotStructuredContext,
} from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotContext')

export interface BuildContextParams {
  userId: string
  workspaceId: string
  workflowId?: string
  selectedBlockId?: string
  executionId?: string
}

export async function buildLocalCopilotContext(
  params: BuildContextParams
): Promise<LocalCopilotStructuredContext> {
  const { userId, workspaceId, workflowId, selectedBlockId, executionId } = params

  const [workspaceRow] = await db
    .select({ id: workspace.id, name: workspace.name })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1)

  if (!workspaceRow) {
    throw new Error('Workspace not found')
  }

  const credentials = await loadCredentialMetadata(workspaceId, userId)
  const availableBlocks = summarizeBlocks(getAllBlocks())
  const availableIntegrations = [...new Set(availableBlocks.map((block) => block.category))].sort()

  if (!workflowId) {
    const workspaceWorkflows = await db
      .select({ id: workflow.id, name: workflow.name })
      .from(workflow)
      .where(eq(workflow.workspaceId, workspaceId))
      .orderBy(desc(workflow.updatedAt))
      .limit(25)

    const context: LocalCopilotStructuredContext = {
      workspace: {
        id: workspaceRow.id,
        name: workspaceRow.name,
        environment: isSelfHostedDeployment() ? 'self_hosted' : 'cloud',
      },
      execution: {
        lastRunStatus: 'unknown',
        logs: [],
        failedBlockId: null,
        error: null,
      },
      availableIntegrations,
      availableBlocks,
      workspaceWorkflows: workspaceWorkflows.map((row) => ({
        id: row.id,
        name: row.name ?? 'Untitled workflow',
      })),
    }

    logger.info('Built Arena Copilot workspace context', {
      workspaceId,
      workflowCount: workspaceWorkflows.length,
      provider: getLocalCopilotConfig().provider,
    })

    return sanitizeForLlm(context)
  }

  const [workflowRow] = await db
    .select({ id: workflow.id, name: workflow.name })
    .from(workflow)
    .where(eq(workflow.id, workflowId))
    .limit(1)

  if (!workflowRow) {
    throw new Error('Workflow not found')
  }

  const normalized = await loadWorkflowFromNormalizedTables(workflowId)
  if (!normalized) {
    throw new Error('Workflow state not found')
  }

  const [workflowMeta] = await db
    .select({ variables: workflow.variables })
    .from(workflow)
    .where(eq(workflow.id, workflowId))
    .limit(1)

  const variables = (workflowMeta?.variables ?? {}) as WorkflowState['variables']

  const execution = await loadExecutionContext({
    userId,
    workspaceId,
    workflowId,
    executionId,
  })

  const context: LocalCopilotStructuredContext = {
    workspace: {
      id: workspaceRow.id,
      name: workspaceRow.name,
      environment: isSelfHostedDeployment() ? 'self_hosted' : 'cloud',
    },
    workflow: {
      id: workflowRow.id,
      name: workflowRow.name ?? 'Untitled workflow',
      blocks: normalized.blocks,
      edges: normalized.edges,
      variables,
      loops: normalized.loops,
      parallels: normalized.parallels,
      credentials,
    },
    execution,
    availableIntegrations,
    availableBlocks,
    selectedBlockId,
  }

  logger.info('Built Arena Copilot context', {
    workflowId,
    blockCount: Object.keys(normalized.blocks).length,
    provider: getLocalCopilotConfig().provider,
  })

  return sanitizeForLlm(context)
}

export function contextToPromptJson(context: LocalCopilotStructuredContext): string {
  const workflowPayload = context.workflow
    ? {
        id: context.workflow.id,
        name: context.workflow.name,
        state: sanitizeForExport({
          blocks: context.workflow.blocks,
          edges: context.workflow.edges,
          loops: context.workflow.loops,
          parallels: context.workflow.parallels,
          variables: context.workflow.variables,
          metadata: { name: context.workflow.name },
        }).state,
        credentials: context.workflow.credentials,
      }
    : null

  return JSON.stringify(
    {
      workspace: context.workspace,
      workflow: workflowPayload,
      workspaceWorkflows: context.workspaceWorkflows,
      execution: context.execution,
      availableIntegrations: context.availableIntegrations,
      availableBlocks: context.availableBlocks,
      selectedBlockId: context.selectedBlockId,
    },
    null,
    2
  )
}

async function loadCredentialMetadata(
  workspaceId: string,
  userId: string
): Promise<LocalCopilotCredentialMetadata[]> {
  const oauthCreds = await getAccessibleOAuthCredentials(workspaceId, userId)
  return oauthCreds.map((cred) => ({
    credentialId: cred.id,
    provider: cred.providerId,
    status: 'connected' as const,
    displayName: cred.displayName,
  }))
}

async function loadExecutionContext(params: {
  userId: string
  workspaceId: string
  workflowId: string
  executionId?: string
}): Promise<LocalCopilotStructuredContext['execution']> {
  const { userId, workspaceId, workflowId, executionId } = params

  try {
    const logsResult = await listLogs(
      {
        workspaceId,
        workflowIds: workflowId,
        limit: executionId ? 1 : 5,
        executionId,
        sortBy: 'date',
        sortOrder: 'desc',
      },
      userId
    )

    const latest = logsResult.data[0]
    if (!latest) {
      return {
        lastRunStatus: 'unknown',
        logs: [],
        failedBlockId: null,
        error: null,
      }
    }

    const status =
      latest.status === 'success'
        ? 'success'
        : latest.status === 'failed'
          ? 'failed'
          : latest.status === 'running'
            ? 'running'
            : 'unknown'

    return {
      lastRunStatus: status,
      executionId: latest.executionId ?? undefined,
      failedBlockId: null,
      error: latest.status === 'failed' ? `Workflow run ${latest.status}` : null,
      logs: [
        {
          level: status === 'failed' ? 'error' : 'info',
          message: `Last run ${latest.status ?? latest.level}`,
          timestamp: latest.createdAt,
        },
      ],
    }
  } catch (error) {
    logger.warn('Failed to load execution context', { workflowId, error })
    return {
      lastRunStatus: 'unknown',
      logs: [],
      failedBlockId: null,
      error: null,
    }
  }
}

function summarizeBlocks(blocks: BlockConfig[]): LocalCopilotBlockSummary[] {
  return blocks
    .filter((block) => !block.hideFromToolbar)
    .map((block) => ({
      id: block.type,
      name: block.name,
      category: block.category,
      description: block.description,
      authMode: block.authMode,
    }))
}
