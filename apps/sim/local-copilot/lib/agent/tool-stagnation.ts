/**
 * Detects empty tool-loop progress: the same tool with equivalent args
 * (and equivalent outcome signature) repeating without advancing the task.
 */

import {
  editWorkflowNeedsFollowUp,
  isOAuthOnlyEditResult,
} from '@/local-copilot/lib/tools/format-tool-result'

/** Identical fingerprints at or above this count trigger stagnation. */
export const TOOL_STAGNATION_THRESHOLD = 3

/**
 * Discovery tools get a slightly higher bar so a couple of overlapping
 * lookups during a build don't abort the turn, but identical re-fetches still stop.
 */
export const DISCOVERY_STAGNATION_THRESHOLD = 4

/** Cap fingerprint payload size so huge args don't dominate. */
const FINGERPRINT_ARGS_MAX = 400

export interface ToolStagnationHit {
  toolName: string
  fingerprint: string
  count: number
  message: string
}

/**
 * Stable-ish fingerprint for a tool call + outcome for stagnation tracking.
 */
export function fingerprintToolCall(
  toolName: string,
  argsJson: string,
  success: boolean,
  result: unknown
): string {
  const normalizedArgs = normalizeArgsForStagnation(toolName, argsJson)
  const outcome = success
    ? `ok:${successOutcomeSignature(toolName, result)}`
    : `err:${outcomeSignature(result)}`
  return `${toolName}|${normalizedArgs}|${outcome}`
}

/**
 * Tracks repeated tool fingerprints within a single agent turn.
 */
export function createToolStagnationTracker(threshold = TOOL_STAGNATION_THRESHOLD): {
  record: (
    toolName: string,
    argsJson: string,
    success: boolean,
    result: unknown
  ) => ToolStagnationHit | null
  reset: () => void
} {
  const counts = new Map<string, number>()

  return {
    record(toolName, argsJson, success, result) {
      if (toolName === 'validate_workflow') {
        return null
      }

      const fingerprint = fingerprintToolCall(toolName, argsJson, success, result)
      const count = (counts.get(fingerprint) ?? 0) + 1
      counts.set(fingerprint, count)
      const limit = toolName === 'get_blocks_metadata' ? DISCOVERY_STAGNATION_THRESHOLD : threshold
      if (count < limit) return null
      return {
        toolName,
        fingerprint,
        count,
        message: buildStagnationUserMessage(toolName, count),
      }
    },
    reset() {
      counts.clear()
    },
  }
}

/**
 * User-facing notice when the agent stops spinning on a dead tool loop.
 */
export function buildStagnationUserMessage(_toolName: string, count: number): string {
  return (
    `I kept retrying the same action (${count} similar attempts) without making progress. ` +
    'Stopping that loop — tell me what to change, or confirm a different approach.'
  )
}

/**
 * System nudge so the model does not resume the same failing call.
 */
export function buildStagnationSystemMessage(hit: ToolStagnationHit): string {
  return (
    `[System] Tool-loop stagnation detected for ${hit.toolName} ` +
    `(${hit.count} equivalent calls). Do not call ${hit.toolName} again with the same arguments. ` +
    'Stop tool use, briefly explain the blocker, and ask the user how to proceed.'
  )
}

/**
 * Coarse arg shape for stagnation: edit retries that only tweak param values or
 * JSON formatting still count as the same loop; discovery fingerprints on ids only.
 */
function normalizeArgsForStagnation(toolName: string, argsJson: string): string {
  const trimmed = argsJson.trim() || '{}'
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (toolName === 'edit_workflow') {
      return JSON.stringify(editWorkflowStagnationShape(parsed)).slice(0, FINGERPRINT_ARGS_MAX)
    }
    if (toolName === 'get_blocks_metadata') {
      return JSON.stringify(blockIdsStagnationShape(parsed)).slice(0, FINGERPRINT_ARGS_MAX)
    }
    return JSON.stringify(sortJson(parsed)).slice(0, FINGERPRINT_ARGS_MAX)
  } catch {
    return trimmed.slice(0, FINGERPRINT_ARGS_MAX)
  }
}

function editWorkflowStagnationShape(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return sortJson(value)
  const record = value as Record<string, unknown>
  const operations = coerceOps(record.operations ?? record.ops ?? record.edits ?? record.operation)
  const blockKeys = operations
    .map((op) => {
      if (!op || typeof op !== 'object' || Array.isArray(op)) return '?'
      const row = op as Record<string, unknown>
      const blockId =
        (typeof row.block_id === 'string' && row.block_id) ||
        (typeof row.blockId === 'string' && row.blockId) ||
        '?'
      const opType =
        (typeof row.operation_type === 'string' && row.operation_type) ||
        (typeof row.operationType === 'string' && row.operationType) ||
        '?'
      const params =
        row.params && typeof row.params === 'object' && !Array.isArray(row.params)
          ? Object.keys(row.params as Record<string, unknown>).sort()
          : []
      return `${blockId}:${opType}:${params.join(',')}`
    })
    .sort()
  return {
    workflowId:
      (typeof record.workflowId === 'string' && record.workflowId) ||
      (typeof record.workflow_id === 'string' && record.workflow_id) ||
      '',
    ops: blockKeys,
  }
}

function blockIdsStagnationShape(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return sortJson(value)
  const record = value as Record<string, unknown>
  const raw =
    record.blockIds ??
    record.block_ids ??
    record.blocks ??
    record.blockId ??
    record.block_id ??
    record.params
  const ids = coerceStringIds(raw)
    .map((id) => id.toLowerCase())
    .sort()
  return { blockIds: ids }
}

function coerceOps(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return [value]
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value.trim()) as unknown
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function coerceStringIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
    )
  }
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim()
    if (trimmed.startsWith('[')) {
      try {
        return coerceStringIds(JSON.parse(trimmed) as unknown)
      } catch {
        return [trimmed]
      }
    }
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    }
    return [trimmed]
  }
  return []
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortJson(record[key])
  }
  return sorted
}

function outcomeSignature(result: unknown): string {
  if (result == null) return 'null'
  if (typeof result === 'string') return result.slice(0, 120)
  if (typeof result !== 'object') return String(result).slice(0, 120)
  const record = result as Record<string, unknown>
  const error =
    typeof record.error === 'string'
      ? record.error
      : typeof record.message === 'string'
        ? record.message
        : JSON.stringify(record).slice(0, 120)
  return error.slice(0, 120)
}

/**
 * Successful edits that still request follow-up (lint / skipped ops) share one
 * bucket so the agent cannot thrash on "almost" success forever.
 */
function successOutcomeSignature(toolName: string, result: unknown): string {
  if (toolName !== 'edit_workflow') return 'ok'
  if (isOAuthOnlyEditResult(result)) return 'needs_oauth'
  if (editWorkflowNeedsFollowUp(result)) return 'needs_follow_up'
  return 'ok'
}
