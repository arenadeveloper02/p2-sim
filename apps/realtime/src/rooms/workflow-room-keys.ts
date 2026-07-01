/**
 * Redis key helpers for collaborative workflow rooms.
 *
 * `workflow:{workflowId}:users` must be a HASH (socketId → presence JSON).
 * `workflow:{workflowId}:meta` must be a HASH (room metadata).
 *
 * If either key exists with another TYPE (e.g. STRING), hash commands such as
 * HSET/HLEN fail with WRONGTYPE and workflow joins retry indefinitely.
 */

export const WORKFLOW_ROOM_KEY_PREFIX = 'workflow:' as const
export const WORKFLOW_USERS_KEY_SUFFIX = ':users' as const
export const WORKFLOW_META_KEY_SUFFIX = ':meta' as const
export const WORKFLOW_USERS_SCAN_PATTERN = 'workflow:*:users' as const

const WORKFLOW_USERS_KEY_PATTERN = /^workflow:(.+):users$/

export function workflowUsersKey(workflowId: string): string {
  return `${WORKFLOW_ROOM_KEY_PREFIX}${workflowId}${WORKFLOW_USERS_KEY_SUFFIX}`
}

export function workflowMetaKey(workflowId: string): string {
  return `${WORKFLOW_ROOM_KEY_PREFIX}${workflowId}${WORKFLOW_META_KEY_SUFFIX}`
}

export function parseWorkflowIdFromUsersKey(key: string): string | null {
  const match = WORKFLOW_USERS_KEY_PATTERN.exec(key)
  return match?.[1] ?? null
}

export interface WorkflowRoomRedisReader {
  type(key: string): Promise<string>
  get?(key: string): Promise<string | null>
}

export interface WorkflowRoomRedisMutator extends WorkflowRoomRedisReader {
  del(keys: string | string[]): Promise<number>
}

export interface CorruptedWorkflowRoomKey {
  key: string
  workflowId: string
  expectedType: 'hash'
  actualType: string
  preview?: string | null
}

export interface HealCorruptedWorkflowRoomKeysResult {
  healed: boolean
  deletedKeys: string[]
  corrupted: CorruptedWorkflowRoomKey[]
}

function isWrongType(actualType: string, expectedType: 'hash'): boolean {
  return actualType !== 'none' && actualType !== expectedType
}

async function inspectCorruptedKey(
  redis: WorkflowRoomRedisReader,
  key: string,
  workflowId: string,
  expectedType: 'hash'
): Promise<CorruptedWorkflowRoomKey | null> {
  const actualType = await redis.type(key)
  if (!isWrongType(actualType, expectedType)) {
    return null
  }

  let preview: string | null | undefined
  if (redis.get && actualType === 'string') {
    try {
      const value = await redis.get(key)
      preview = value ? value.slice(0, 200) : null
    } catch {
      preview = null
    }
  }

  return {
    key,
    workflowId,
    expectedType,
    actualType,
    preview,
  }
}

/**
 * Returns corrupted workflow room keys for a single workflow without mutating Redis.
 */
export async function findCorruptedWorkflowRoomKeys(
  redis: WorkflowRoomRedisReader,
  workflowId: string
): Promise<CorruptedWorkflowRoomKey[]> {
  const keys = [
    { key: workflowUsersKey(workflowId), expectedType: 'hash' as const },
    { key: workflowMetaKey(workflowId), expectedType: 'hash' as const },
  ]

  const corrupted: CorruptedWorkflowRoomKey[] = []
  for (const entry of keys) {
    const result = await inspectCorruptedKey(redis, entry.key, workflowId, entry.expectedType)
    if (result) {
      corrupted.push(result)
    }
  }

  return corrupted
}

/**
 * Deletes workflow room keys that have the wrong Redis TYPE so hash operations can succeed.
 */
export async function healCorruptedWorkflowRoomKeys(
  redis: WorkflowRoomRedisMutator,
  workflowId: string
): Promise<HealCorruptedWorkflowRoomKeysResult> {
  const corrupted = await findCorruptedWorkflowRoomKeys(redis, workflowId)
  if (corrupted.length === 0) {
    return { healed: false, deletedKeys: [], corrupted: [] }
  }

  const deletedKeys = corrupted.map((entry) => entry.key)
  await redis.del(deletedKeys)

  return {
    healed: true,
    deletedKeys,
    corrupted,
  }
}
