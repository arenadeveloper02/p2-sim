import {
  type ArenaGenerativeActionSurface,
  type ArenaGenerativeChatProtocol,
  hasChatProtocolInput,
} from '@/lib/arena-generative-ui/chat-protocol'
import { isChatInputPrefixName, isReservedStartInputName } from '@/lib/arena-generative-ui/input-schema'
import {
  ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_ERROR_KEY,
  ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_KEY,
  ARENA_GENERATIVE_CHAT_TURNS_KEY,
} from '@/lib/arena-generative-ui/types'

export type ArenaGenerativeChatTurnRole = 'user' | 'assistant'

export interface ArenaGenerativeChatTurn {
  role: ArenaGenerativeChatTurnRole
  content: string
  error?: string
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
 * Writes a visitor-facing error onto the last assistant turn.
 */
export function withLastAssistantError(
  turns: unknown,
  error: string
): ArenaGenerativeChatTurn[] | undefined {
  const message = error.trim()
  if (!message) return undefined
  const list = chatTurnsFromUnknown(turns)
  if (list.length === 0) return undefined
  const last = list[list.length - 1]
  if (last.role !== 'assistant') return undefined
  return [...list.slice(0, -1), { ...last, error: message }]
}

/**
 * Composer text, or `name: value` from a form CTA, for the right-side bubble.
 */
export function chatUserMessageFromValues(values: Record<string, unknown>): string {
  const typed = typeof values.input === 'string' ? values.input.trim() : ''
  if (typed) return typed
  const parts: string[] = []
  for (const [name, raw] of Object.entries(values)) {
    if (!name || isReservedStartInputName(name) || isChatInputPrefixName(name)) continue
    if (raw === undefined || raw === null || typeof raw === 'object') continue
    const text = typeof raw === 'string' ? raw.trim() : String(raw)
    if (!text) continue
    parts.push(`${name}: ${text}`)
  }
  return parts.join(' ')
}

/**
 * Optimistic user + empty assistant pair when Chat or a chat-protocol form
 * submits a visible message.
 */
export function chatTurnsSeedFromCta(
  actionId: string,
  values: Record<string, unknown>,
  surface?: ArenaGenerativeActionSurface,
  actionChatProtocol?: Record<string, ArenaGenerativeChatProtocol>
): ArenaGenerativeChatTurn[] | undefined {
  const message = chatUserMessageFromValues(values)
  if (!message) return undefined
  if (surface === 'chat' || hasChatProtocolInput(actionChatProtocol?.[actionId])) {
    return chatTurnPair(message)
  }
  return undefined
}

/**
 * Patch-only key consumed by `mergeHostState` to update the last assistant turn.
 */
export function lastAssistantPatch(content: string): Record<string, unknown> {
  return { [ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_KEY]: content }
}

/**
 * Patch-only key consumed by `mergeHostState` to mark the last assistant failed.
 */
export function lastAssistantErrorPatch(error: string): Record<string, unknown> {
  return { [ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_ERROR_KEY]: error }
}

function chatTurnsFromUnknown(value: unknown): ArenaGenerativeChatTurn[] {
  if (!Array.isArray(value)) return []
  const turns: ArenaGenerativeChatTurn[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    if (record.role !== 'user' && record.role !== 'assistant') continue
    const error = typeof record.error === 'string' ? record.error.trim() : ''
    turns.push({
      role: record.role,
      content: typeof record.content === 'string' ? record.content : '',
      ...(error ? { error } : {}),
    })
  }
  return turns
}
