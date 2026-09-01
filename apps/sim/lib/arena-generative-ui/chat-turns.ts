import {
  ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_KEY,
  ARENA_GENERATIVE_CHAT_TURNS_KEY,
} from '@/lib/arena-generative-ui/types'

export type ArenaGenerativeChatTurnRole = 'user' | 'assistant'

export interface ArenaGenerativeChatTurn {
  role: ArenaGenerativeChatTurnRole
  content: string
}

/**
 * Reads host-owned chat turns. Invalid entries are dropped.
 */
export function chatTurnsFromState(state: Record<string, unknown>): ArenaGenerativeChatTurn[] {
  return chatTurnsFromUnknown(state[ARENA_GENERATIVE_CHAT_TURNS_KEY])
}

/**
 * User message plus an empty assistant slot for the in-flight reply.
 */
export function chatTurnPair(userInput: string): ArenaGenerativeChatTurn[] {
  return [
    { role: 'user', content: userInput },
    { role: 'assistant', content: '' },
  ]
}

/**
 * Writes `content` onto the last assistant turn. Returns undefined when there
 * is no assistant slot so callers skip the host-state write.
 */
export function withLastAssistantContent(
  turns: unknown,
  content: string
): ArenaGenerativeChatTurn[] | undefined {
  const list = chatTurnsFromUnknown(turns)
  if (list.length === 0) return undefined
  const last = list[list.length - 1]
  if (last.role !== 'assistant') return undefined
  return [...list.slice(0, -1), { ...last, content }]
}

/**
 * Patch-only key consumed by `mergeHostState` to update the last assistant turn.
 */
export function lastAssistantPatch(content: string): Record<string, unknown> {
  return { [ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_KEY]: content }
}

function chatTurnsFromUnknown(value: unknown): ArenaGenerativeChatTurn[] {
  if (!Array.isArray(value)) return []
  const turns: ArenaGenerativeChatTurn[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    if (record.role !== 'user' && record.role !== 'assistant') continue
    turns.push({
      role: record.role,
      content: typeof record.content === 'string' ? record.content : '',
    })
  }
  return turns
}
