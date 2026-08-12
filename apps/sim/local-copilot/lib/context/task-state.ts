import { truncate } from '@sim/utils/string'
import {
  loadCopilotChatConfig,
  mergeCopilotChatConfig,
} from '@/local-copilot/lib/context/chat-config'
import type { ChatMessage } from '@/local-copilot/lib/providers/types'

export const TASK_STATE_SYSTEM_PREFIX = 'Active task (durable, outside transcript):'

export type CopilotTaskStatus = 'active' | 'blocked' | 'completed' | 'failed'

export interface CopilotTaskState {
  objective: string
  status: CopilotTaskStatus
  targetResources: string[]
  dependencies: string[]
  approvals: string[]
  verification: string[]
  updatedAt: string
}

const STATUSES = new Set<CopilotTaskStatus>(['active', 'blocked', 'completed', 'failed'])

function toStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return [...fallback]
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

/**
 * Parses unknown JSON into CopilotTaskState.
 */
export function parseTaskState(value: unknown): CopilotTaskState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const objective = typeof record.objective === 'string' ? record.objective.trim() : ''
  if (!objective) return null
  const status = typeof record.status === 'string' ? record.status.trim() : ''
  if (!STATUSES.has(status as CopilotTaskStatus)) return null
  const updatedAt =
    typeof record.updatedAt === 'string' && record.updatedAt.trim()
      ? record.updatedAt.trim()
      : new Date().toISOString()

  return clampTaskState({
    objective,
    status: status as CopilotTaskStatus,
    targetResources: toStringArray(record.targetResources),
    dependencies: toStringArray(record.dependencies),
    approvals: toStringArray(record.approvals),
    verification: toStringArray(record.verification),
    updatedAt,
  })
}

/**
 * Enforces size caps on Task fields.
 */
export function clampTaskState(task: CopilotTaskState): CopilotTaskState {
  return {
    objective: truncate(task.objective.trim(), 280, ''),
    status: task.status,
    targetResources: [
      ...new Set(task.targetResources.map((item) => item.trim()).filter(Boolean)),
    ].slice(-8),
    dependencies: task.dependencies
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(-8),
    approvals: task.approvals
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(-8),
    verification: task.verification
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(-8),
    updatedAt: task.updatedAt,
  }
}

/**
 * Formats Task state as a system chat message.
 */
export function formatTaskStateSystemMessage(task: CopilotTaskState): ChatMessage {
  const payload = {
    objective: task.objective,
    status: task.status,
    targetResources: task.targetResources,
    dependencies: task.dependencies,
    approvals: task.approvals,
    verification: task.verification,
  }
  return {
    role: 'system',
    content: `${TASK_STATE_SYSTEM_PREFIX}\n${JSON.stringify(payload, null, 2)}`,
  }
}

export function isTaskStateSystemMessage(message: ChatMessage): boolean {
  if (message.role !== 'system') return false
  const text = typeof message.content === 'string' ? message.content : ''
  return text.startsWith(TASK_STATE_SYSTEM_PREFIX)
}

/**
 * Loads Task state from chat config.
 */
export async function loadTaskState(
  chatId: string,
  userId: string
): Promise<CopilotTaskState | null> {
  const config = await loadCopilotChatConfig(chatId, userId)
  if (!config) return null
  return parseTaskState(config.taskState)
}

/**
 * Persists Task state into chat config.
 */
export async function persistTaskState(
  chatId: string,
  userId: string,
  task: CopilotTaskState
): Promise<void> {
  await mergeCopilotChatConfig(chatId, userId, { taskState: clampTaskState(task) })
}

export interface TurnVerificationHint {
  tool: string
  status: string
}

/**
 * Builds/updates Task state from turn outcomes.
 */
export function updateTaskStateFromTurn(params: {
  previous: CopilotTaskState | null
  objectiveHint: string | null
  approvals: string[]
  verification: TurnVerificationHint[]
  failed: boolean
  targetResources?: string[]
}): CopilotTaskState | null {
  const objective = params.objectiveHint?.trim() || params.previous?.objective?.trim() || ''
  if (!objective) return params.previous

  const verificationLines = params.verification.map((item) => `${item.tool} ${item.status}`.trim())
  const anyFailed = params.failed || params.verification.some((item) => item.status === 'failed')
  const allPassed =
    params.verification.length > 0 &&
    params.verification.every(
      (item) => item.status === 'verified' || item.status === 'passed' || item.status === 'skipped'
    )

  let status: CopilotTaskStatus = params.previous?.status ?? 'active'
  if (anyFailed) status = 'failed'
  else if (allPassed && params.approvals.length > 0) status = 'completed'
  else if (allPassed) status = 'completed'
  else if (params.approvals.some((item) => /rejected/i.test(item))) status = 'blocked'
  else status = 'active'

  return clampTaskState({
    objective,
    status,
    targetResources: [
      ...(params.previous?.targetResources ?? []),
      ...(params.targetResources ?? []),
    ],
    dependencies: params.previous?.dependencies ?? [],
    approvals: [...(params.previous?.approvals ?? []), ...params.approvals],
    verification: [...(params.previous?.verification ?? []), ...verificationLines],
    updatedAt: new Date().toISOString(),
  })
}
