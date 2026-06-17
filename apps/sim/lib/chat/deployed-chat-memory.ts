import { db } from '@sim/db'
import { workflowDeploymentVersion, workflowExecutionLogs } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { truncate } from '@sim/utils/string'
import { and, desc, eq, isNotNull, ne, or } from 'drizzle-orm'

const logger = createLogger('DeployedChatMemory')

/** Reserved workflow input keys injected by deployed chat; excluded from user-facing initial input. */
export const DEPLOYED_CHAT_MEMORY_RESERVED_INPUT_KEYS = [
  'chatHistory',
  'chatHistoryMeta',
] as const

export const DEPLOYED_CHAT_MEMORY_MAX_TURNS = 20
export const DEPLOYED_CHAT_MEMORY_MAX_CHARS = 80_000

export interface DeployedChatDeploymentVersionMeta {
  deploymentVersionId: string | null
  version: number | null
  versionName: string | null
  versionCreatedAt: string | null
}

export interface DeployedChatMemoryTurn {
  executionId: string
  startedAt: string
  userInput: string
  assistantOutput: string
  deploymentVersion: DeployedChatDeploymentVersionMeta
}

export interface DeployedChatMemoryContext {
  turns: DeployedChatMemoryTurn[]
  summary: string
  currentDeploymentVersion: DeployedChatDeploymentVersionMeta
  versionChangedFromHistory: boolean
}

export interface LoadDeployedChatMemoryParams {
  workflowId: string
  chatId?: string
  conversationId?: string
  userId?: string
  excludeExecutionId?: string
  currentDeploymentVersion?: DeployedChatDeploymentVersionMeta
}

function toDeploymentVersionMeta(row: {
  deploymentVersionId: string | null
  version: number | null
  versionName: string | null
  versionCreatedAt: Date | null
}): DeployedChatDeploymentVersionMeta {
  return {
    deploymentVersionId: row.deploymentVersionId,
    version: row.version,
    versionName: row.versionName,
    versionCreatedAt: row.versionCreatedAt?.toISOString() ?? null,
  }
}

export async function loadActiveDeploymentVersionMeta(
  workflowId: string
): Promise<DeployedChatDeploymentVersionMeta> {
  const [active] = await db
    .select({
      deploymentVersionId: workflowDeploymentVersion.id,
      version: workflowDeploymentVersion.version,
      versionName: workflowDeploymentVersion.name,
      versionCreatedAt: workflowDeploymentVersion.createdAt,
    })
    .from(workflowDeploymentVersion)
    .where(
      and(
        eq(workflowDeploymentVersion.workflowId, workflowId),
        eq(workflowDeploymentVersion.isActive, true)
      )
    )
    .limit(1)

  if (!active) {
    return {
      deploymentVersionId: null,
      version: null,
      versionName: null,
      versionCreatedAt: null,
    }
  }

  return toDeploymentVersionMeta(active)
}

function buildThreadFilter(params: Pick<LoadDeployedChatMemoryParams, 'chatId' | 'conversationId'>) {
  if (params.chatId) {
    return eq(workflowExecutionLogs.chatId, params.chatId)
  }

  if (params.conversationId) {
    return or(
      eq(workflowExecutionLogs.conversationId, params.conversationId),
      eq(workflowExecutionLogs.chatId, params.conversationId)
    )
  }

  return undefined
}

/**
 * Loads prior completed deployed-chat turns for a thread and builds a bounded prompt context.
 */
export async function loadDeployedChatMemoryContext(
  params: LoadDeployedChatMemoryParams
): Promise<DeployedChatMemoryContext> {
  const currentDeploymentVersion =
    params.currentDeploymentVersion ??
    (await loadActiveDeploymentVersionMeta(params.workflowId))

  const threadFilter = buildThreadFilter(params)
  if (!threadFilter) {
    return {
      turns: [],
      summary: '',
      currentDeploymentVersion,
      versionChangedFromHistory: false,
    }
  }

  const conditions = [
    eq(workflowExecutionLogs.workflowId, params.workflowId),
    eq(workflowExecutionLogs.isExternalChat, true),
    eq(workflowExecutionLogs.status, 'completed'),
    eq(workflowExecutionLogs.level, 'info'),
    isNotNull(workflowExecutionLogs.initialInput),
    isNotNull(workflowExecutionLogs.finalChatOutput),
    threadFilter,
  ]

  if (params.userId) {
    conditions.push(eq(workflowExecutionLogs.userId, params.userId))
  }

  if (params.excludeExecutionId) {
    conditions.push(ne(workflowExecutionLogs.executionId, params.excludeExecutionId))
  }

  try {
    const rows = await db
      .select({
        executionId: workflowExecutionLogs.executionId,
        startedAt: workflowExecutionLogs.startedAt,
        initialInput: workflowExecutionLogs.initialInput,
        finalChatOutput: workflowExecutionLogs.finalChatOutput,
        deploymentVersionId: workflowExecutionLogs.deploymentVersionId,
        version: workflowDeploymentVersion.version,
        versionName: workflowDeploymentVersion.name,
        versionCreatedAt: workflowDeploymentVersion.createdAt,
      })
      .from(workflowExecutionLogs)
      .leftJoin(
        workflowDeploymentVersion,
        eq(workflowExecutionLogs.deploymentVersionId, workflowDeploymentVersion.id)
      )
      .where(and(...conditions))
      .orderBy(desc(workflowExecutionLogs.startedAt))
      .limit(DEPLOYED_CHAT_MEMORY_MAX_TURNS * 2)

    const chronologicalTurns = rows
      .reverse()
      .map((row) => ({
        executionId: row.executionId,
        startedAt: row.startedAt.toISOString(),
        userInput: row.initialInput?.trim() ?? '',
        assistantOutput: row.finalChatOutput?.trim() ?? '',
        deploymentVersion: toDeploymentVersionMeta({
          deploymentVersionId: row.deploymentVersionId,
          version: row.version,
          versionName: row.versionName,
          versionCreatedAt: row.versionCreatedAt,
        }),
      }))
      .filter((turn) => turn.userInput.length > 0 && turn.assistantOutput.length > 0)

    const boundedTurns = applyMemoryBudget(chronologicalTurns)
    const versionChangedFromHistory = boundedTurns.some(
      (turn) =>
        turn.deploymentVersion.deploymentVersionId !== null &&
        currentDeploymentVersion.deploymentVersionId !== null &&
        turn.deploymentVersion.deploymentVersionId !== currentDeploymentVersion.deploymentVersionId
    )

    return {
      turns: boundedTurns,
      summary: buildMemorySummary(boundedTurns, currentDeploymentVersion, versionChangedFromHistory),
      currentDeploymentVersion,
      versionChangedFromHistory,
    }
  } catch (error) {
    logger.error('Failed to load deployed chat memory context', {
      workflowId: params.workflowId,
      chatId: params.chatId,
      conversationId: params.conversationId,
      error,
    })

    return {
      turns: [],
      summary: '',
      currentDeploymentVersion,
      versionChangedFromHistory: false,
    }
  }
}

function formatVersionLabel(version: DeployedChatDeploymentVersionMeta): string {
  if (version.version !== null) {
    return version.versionName
      ? `v${version.version} (${version.versionName})`
      : `v${version.version}`
  }

  return 'unknown deployment'
}

function buildTurnBlock(turn: DeployedChatMemoryTurn): string {
  const versionLabel = formatVersionLabel(turn.deploymentVersion)
  return [
    `[${turn.startedAt}] deployment ${versionLabel}`,
    `User: ${turn.userInput}`,
    `Assistant: ${turn.assistantOutput}`,
  ].join('\n')
}

export function buildMemorySummary(
  turns: DeployedChatMemoryTurn[],
  currentDeploymentVersion: DeployedChatDeploymentVersionMeta,
  versionChangedFromHistory: boolean
): string {
  if (turns.length === 0) {
    return ''
  }

  const blocks = turns.map(buildTurnBlock)
  const lines: string[] = []

  if (versionChangedFromHistory) {
    lines.push(
      `Note: Earlier turns may reference prior deployment versions. Current turn runs deployment ${formatVersionLabel(currentDeploymentVersion)}.`
    )
  }

  lines.push('Prior conversation history:')
  lines.push(blocks.join('\n---\n'))

  return truncate(lines.join('\n\n'), DEPLOYED_CHAT_MEMORY_MAX_CHARS)
}

function applyMemoryBudget(turns: DeployedChatMemoryTurn[]): DeployedChatMemoryTurn[] {
  if (turns.length === 0) {
    return []
  }

  const selected: DeployedChatMemoryTurn[] = []
  let totalChars = 0

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    const turnChars = buildTurnBlock(turn).length + 5

    if (selected.length >= DEPLOYED_CHAT_MEMORY_MAX_TURNS) {
      break
    }

    if (selected.length > 0 && totalChars + turnChars > DEPLOYED_CHAT_MEMORY_MAX_CHARS) {
      break
    }

    selected.unshift(turn)
    totalChars += turnChars
  }

  return selected
}

export function toHistoryDeploymentVersionMeta(row: {
  deploymentVersionId: string | null
  version: number | null
  versionName: string | null
  versionCreatedAt: Date | null
}): DeployedChatDeploymentVersionMeta {
  return toDeploymentVersionMeta(row)
}
