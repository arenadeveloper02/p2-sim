import { db } from '@sim/db'
import { user, workflow, workflowExecutionLogs, workspace } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import type { WorkflowState } from '@sim/workflow-types/workflow'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { generateWorkspaceSnapshot } from '@/lib/copilot/chat/workspace-context'
import type { VfsSnapshotV1 } from '@/lib/copilot/generated/vfs-snapshot-v1'
import { loadUserMemoriesForContext } from '@/lib/copilot/tools/server/other/user-memory'
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
import {
  type StampedWorkspaceSnapshotBundle,
  stampWorkspaceSnapshotBundle,
} from '@/local-copilot/lib/context/snapshot-freshness'
import { loadWorkspaceSkillSummaries } from '@/local-copilot/lib/tools/user-skills'
import type {
  LocalCopilotBlockSummary,
  LocalCopilotStructuredContext,
} from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotContext')

/** Prebuilt workspace inventory bundle from {@link generateWorkspaceSnapshot}. */
export type WorkspaceSnapshotBundle = StampedWorkspaceSnapshotBundle

export interface BuildContextParams {
  userId: string
  workspaceId: string
  workflowId?: string
  selectedBlockId?: string
  executionId?: string
  /**
   * Prebuilt workspace snapshot. The mothership lifecycle already fetches this in
   * `post.ts`, so it is threaded through to avoid a second identical DB fetch.
   * When omitted, this builder fetches its own snapshot.
   */
  workspaceSnapshot?: WorkspaceSnapshotBundle | null
}

type SnapshotResourceContext = Pick<
  LocalCopilotStructuredContext,
  'knowledgeBases' | 'tables' | 'workspaceFiles'
>

/** Maps a typed workspace snapshot into Local structured resource summaries. */
export function mapSnapshotResources(snapshot: VfsSnapshotV1): SnapshotResourceContext {
  return {
    knowledgeBases: (snapshot.knowledgeBases ?? []).map((kb) => ({
      id: kb.id,
      name: kb.name,
      description: kb.description ?? null,
      ...(kb.connectorTypes && kb.connectorTypes.length > 0
        ? { connectorTypes: kb.connectorTypes }
        : {}),
    })),
    tables: (snapshot.tables ?? []).map((table) => ({
      id: table.id,
      name: table.name,
      description: table.description ?? null,
    })),
    workspaceFiles: (snapshot.files ?? []).map((file) => ({
      id: file.id,
      name: file.name,
      path: file.path,
      type: file.type ?? '',
      size: file.size ?? 0,
    })),
  }
}

/** Maps a typed workspace snapshot into the Local `workspaceWorkflows` inventory. */
export function mapSnapshotWorkflows(
  snapshot: VfsSnapshotV1
): NonNullable<LocalCopilotStructuredContext['workspaceWorkflows']> {
  return (snapshot.workflows ?? []).map((wf) => ({
    id: wf.id,
    name: wf.name,
    isDeployed: wf.isDeployed ?? false,
    ...(wf.path ? { path: wf.path } : {}),
    ...(wf.folderPath ? { folderPath: wf.folderPath } : {}),
    ...(wf.description ? { description: wf.description } : {}),
  }))
}

/**
 * Resolves the workspace snapshot, preferring a caller-supplied bundle and
 * falling back to a fresh fetch. Returns null when the snapshot is unavailable
 * so callers can degrade to the legacy per-resource loaders.
 */
async function resolveWorkspaceSnapshot(
  params: BuildContextParams
): Promise<WorkspaceSnapshotBundle | null> {
  if (params.workspaceSnapshot) {
    return stampWorkspaceSnapshotBundle(params.workspaceSnapshot)
  }
  try {
    const generated = await generateWorkspaceSnapshot(params.workspaceId, params.userId)
    if (!generated) return null
    return stampWorkspaceSnapshotBundle(generated)
  } catch (error) {
    logger.warn('Failed to load workspace snapshot; falling back to legacy loaders', {
      workspaceId: params.workspaceId,
      error: getErrorMessage(error, 'snapshot failed'),
    })
    return null
  }
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

  const snapshotBundle = await resolveWorkspaceSnapshot(params)
  const snapshot = snapshotBundle?.snapshot ?? null
  const inventoryMarkdown = snapshotBundle?.markdown

  const [integrations, currentUserRow] = await Promise.all([
    loadWorkspaceIntegrations(workspaceId, userId),
    db
      .select({ email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((rows) => rows[0]),
  ])
  const currentUser =
    currentUserRow?.email?.trim()
      ? {
          email: currentUserRow.email.trim(),
          ...(currentUserRow.name?.trim() ? { name: currentUserRow.name.trim() } : {}),
        }
      : undefined
  const credentials = oauthIntegrationsToCredentialMetadata(integrations.connectedIntegrations)
  // Prefer the unified snapshot as the single inventory source; fall back to the
  // legacy per-resource loaders only when the snapshot is unavailable.
  const resources = snapshot
    ? mapSnapshotResources(snapshot)
    : await loadWorkspaceResourceSummaries(workspaceId)
  const skills = snapshot
    ? (snapshot.skills ?? []).map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description ?? '',
      }))
    : await loadWorkspaceSkillSummaries(workspaceId)
  const userMemories = await loadUserMemoriesForContext(userId, workspaceId)
  const availableBlocks = summarizeBlocks(getAllBlocks())
  const availableIntegrations = [...new Set(availableBlocks.map((block) => block.category))].sort()

  const integrationContext = {
    ...(currentUser ? { currentUser } : {}),
    connectedIntegrations: integrations.connectedIntegrations,
    envVariables: integrations.envVariables,
    hostedKeysAvailable: integrations.hostedKeysAvailable,
    e2b: getLocalCopilotE2bCapabilities(),
  }

  const resourceContext = {
    knowledgeBases: resources.knowledgeBases,
    tables: resources.tables,
    workspaceFiles: resources.workspaceFiles,
    ...(inventoryMarkdown ? { inventoryMarkdown } : {}),
    ...(snapshotBundle?.generatedAt && snapshotBundle.contentRevision
      ? {
          snapshotFreshness: {
            generatedAt: snapshotBundle.generatedAt,
            contentRevision: snapshotBundle.contentRevision,
            workspaceId,
          },
          vfsSnapshot: snapshotBundle.snapshot,
        }
      : {}),
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

  const workspaceWorkflows = snapshot
    ? mapSnapshotWorkflows(snapshot)
    : (
        await db
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
      ).map((row) => ({
        id: row.id,
        name: row.name ?? 'Untitled workflow',
        isDeployed: row.isDeployed,
        lastRunAt: row.lastRunAt?.toISOString() ?? null,
      }))

  const workspaceWorkflowsContext = { workspaceWorkflows }

  if (!workflowId) {
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
      ...workspaceWorkflowsContext,
    }

    logger.info('Built Arena Copilot workspace context', {
      workspaceId,
      inventorySource: snapshot ? 'snapshot' : 'legacy',
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
    ...workspaceWorkflowsContext,
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
    inventorySource: snapshot ? 'snapshot' : 'legacy',
    blockCount: Object.keys(normalized.blocks).length,
    workflowCount: workspaceWorkflows.length,
    skillCount: skills.length,
    envVariableCount: integrations.envVariables.length,
    connectedIntegrationCount: integrations.connectedIntegrations.length,
    provider: getLocalCopilotConfig().provider,
  })

  return context
}

export function contextToPromptJson(
  context: LocalCopilotStructuredContext,
  options?: {
    workflowDetail?: 'full' | 'compact'
    inventoryMode?: 'full' | 'delta' | 'unchanged'
    snapshotRevision?: string
  }
): string {
  return buildContextPromptPayload(context, options)
}

async function loadExecutionContext(params: {
  workflowId: string
  executionId?: string
}): Promise<LocalCopilotStructuredContext['execution']> {
  const { workflowId, executionId } = params

  try {
    const logColumns = {
      status: workflowExecutionLogs.status,
      executionId: workflowExecutionLogs.executionId,
      startedAt: workflowExecutionLogs.startedAt,
    } as const

    const [latest] = executionId
      ? await db
          .select(logColumns)
          .from(workflowExecutionLogs)
          .where(eq(workflowExecutionLogs.executionId, executionId))
          .limit(1)
      : await db
          .select(logColumns)
          .from(workflowExecutionLogs)
          .where(eq(workflowExecutionLogs.workflowId, workflowId))
          .orderBy(desc(workflowExecutionLogs.startedAt))
          .limit(1)

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
          message: `Last run ${latest.status}`,
          timestamp:
            latest.startedAt instanceof Date
              ? latest.startedAt.toISOString()
              : String(latest.startedAt),
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
