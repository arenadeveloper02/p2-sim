/**
 * Detects empty tool-loop progress: the same tool with equivalent args
 * (and equivalent outcome signature) repeating without advancing the task.
 */

/** Identical fingerprints at or above this count trigger stagnation. */
export const TOOL_STAGNATION_THRESHOLD = 3

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
  const normalizedArgs = normalizeArgsJson(argsJson)
  const outcome = success ? 'ok' : `err:${outcomeSignature(result)}`
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
      const fingerprint = fingerprintToolCall(toolName, argsJson, success, result)
      const count = (counts.get(fingerprint) ?? 0) + 1
      counts.set(fingerprint, count)
      if (count < threshold) return null
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

function normalizeArgsJson(argsJson: string): string {
  const trimmed = argsJson.trim() || '{}'
  try {
    const parsed = JSON.parse(trimmed) as unknown
    return JSON.stringify(sortJson(parsed)).slice(0, FINGERPRINT_ARGS_MAX)
  } catch {
    return trimmed.slice(0, FINGERPRINT_ARGS_MAX)
  }
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
