import { db } from '@sim/db'
import { workflow, workspace } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import type { WorkflowState } from '@sim/workflow-types/workflow'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { loadUserMemoriesForContext } from '@/lib/copilot/tools/server/other/user-memory'
import { listLogs } from '@/lib/logs/list-logs'
import { loadWorkflowFromNormalizedTables } from '@/lib/workflows/persistence/utils'
import { getAllBlocks } from '@/blocks/registry'
import type { BlockConfig } from '@/blocks/types'
import { getLocalCopilotConfig, isSelfHostedDeployment } from '@/local-copilot/lib/config'
import { buildContextPromptPayload } from '@/local-copilot/lib/context/context-budget'
import { getLocalCopilotE2bCapabilities } from '@/local-copilot/lib/context/e2b-capabilities'
import {
  loadWorkspaceIntegrations,
  oauthIntegrationsToCredentialMetadata,
} from '@/local-copilot/lib/context/load-workspace-integrations'
import { loadWorkspaceResourceSummaries } from '@/local-copilot/lib/context/load-workspace-resources'
import { loadWorkspaceSkillSummaries } from '@/local-copilot/lib/tools/user-skills'
import type {
  LocalCopilotBlockSummary,
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

  const integrations = await loadWorkspaceIntegrations(workspaceId, userId)
  const credentials = oauthIntegrationsToCredentialMetadata(integrations.connectedIntegrations)
  const resources = await loadWorkspaceResourceSummaries(workspaceId)
  const skills = await loadWorkspaceSkillSummaries(workspaceId)
  const userMemories = await loadUserMemoriesForContext(userId, workspaceId)
  const availableBlocks = summarizeBlocks(getAllBlocks())
  const availableIntegrations = [...new Set(availableBlocks.map((block) => block.category))].sort()

  const integrationContext = {
    connectedIntegrations: integrations.connectedIntegrations,
    envVariables: integrations.envVariables,
    hostedKeysAvailable: integrations.hostedKeysAvailable,
    e2b: getLocalCopilotE2bCapabilities(),
  }

  const resourceContext = {
    knowledgeBases: resources.knowledgeBases,
    tables: resources.tables,
    workspaceFiles: resources.workspaceFiles,
    ...(skills.length > 0 ? { skills } : {}),
    ...(userMemories.length > 0
      ? {
          userMemories: userMemories.map((memory) => ({
            key: memory.key,
            value: memory.value,
            memoryType: memory.memoryType,
            source: memory.source,
            confidence: memory.confidence,
          })),
        }
      : {}),
  }

  if (!workflowId) {
    const workspaceWorkflows = await db
      .select({
        id: workflow.id,
        name: workflow.name,
        isDeployed: workflow.isDeployed,
        lastRunAt: workflow.lastRunAt,
      })
      .from(workflow)
      .where(and(eq(workflow.workspaceId, workspaceId), isNull(workflow.archivedAt)))
      .orderBy(desc(workflow.updatedAt))
      .limit(50)

    const context: LocalCopilotStructuredContext = {
      workspace: {
        id: workspaceRow.id,
        name: workspaceRow.name,
        environment: isSelfHostedDeployment() ? 'self_hosted' : 'cloud',
      },
      ...integrationContext,
      ...resourceContext,
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
        isDeployed: row.isDeployed,
        lastRunAt: row.lastRunAt?.toISOString() ?? null,
      })),
      ...(workspaceWorkflows.length > 0
        ? {
            guidance:
              'Existing workflows are listed in workspaceWorkflows. When the user wants to run, test, execute, debug, or use a workflow, call get_workflow_run_options then run_workflow on a matching entry — never create_workflow. Only create_workflow when the user explicitly asks for a brand-new workflow with a distinct purpose and name (pass confirmNewWorkflow: true).',
          }
        : {}),
    }

    logger.info('Built Arena Copilot workspace context', {
      workspaceId,
      workflowCount: workspaceWorkflows.length,
      fileCount: resources.workspaceFiles.length,
      tableCount: resources.tables.length,
      knowledgeBaseCount: resources.knowledgeBases.length,
      skillCount: skills.length,
      userMemoryCount: userMemories.length,
      envVariableCount: integrations.envVariables.length,
      connectedIntegrationCount: integrations.connectedIntegrations.length,
      provider: getLocalCopilotConfig().provider,
    })

    return context
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
    ...integrationContext,
    ...resourceContext,
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
    skillCount: skills.length,
    envVariableCount: integrations.envVariables.length,
    connectedIntegrationCount: integrations.connectedIntegrations.length,
    provider: getLocalCopilotConfig().provider,
  })

  return context
}

export function contextToPromptJson(
  context: LocalCopilotStructuredContext,
  options?: { workflowDetail?: 'full' | 'compact' }
): string {
  return buildContextPromptPayload(context, options)
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
