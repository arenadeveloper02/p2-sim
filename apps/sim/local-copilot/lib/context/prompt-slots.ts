import { truncateToTokenLimit } from '@/lib/tokenization/estimators'
import {
  estimateChatMessagesTokens,
  fitPromptToTokenBudget,
  LOCAL_COPILOT_PROMPT_TOKEN_BUDGET,
} from '@/local-copilot/lib/context/context-budget'
import { getMessageContentText } from '@/local-copilot/lib/providers/message-content'
import type { ChatMessage } from '@/local-copilot/lib/providers/types'

const DEFAULT_MODEL = 'gpt-4o'

/** Keep in sync with `SESSION_MEMORY_SYSTEM_PREFIX` (avoid importing session-memory here). */
const SESSION_MEMORY_PREFIX = 'Session memory (authoritative for earlier turns):'
/** Keep in sync with `TASK_STATE_SYSTEM_PREFIX`. */
const TASK_STATE_PREFIX = 'Active task (durable, outside transcript):'

export type PromptSlotKind =
  | 'policy'
  | 'snapshot'
  | 'task'
  | 'summary'
  | 'recent'
  | 'evidence'
  | 'other'

/**
 * Classifies a system/user/assistant/tool message into a budget slot.
 */
export function classifyPromptSlot(message: ChatMessage): PromptSlotKind {
  if (message.role === 'tool') return 'evidence'
  if (message.role !== 'system') return 'recent'

  const text = getMessageContentText(message.content)
  if (text.startsWith('Workspace snapshot:')) return 'snapshot'
  if (text.startsWith(TASK_STATE_PREFIX)) return 'task'
  if (text.startsWith(SESSION_MEMORY_PREFIX)) return 'summary'
  if (text.startsWith('Session constraints:') || text.startsWith('Active user directive:')) {
    return 'summary'
  }
  if (text.startsWith('Current context:')) return 'snapshot'
  return 'policy'
}

function replaceSystemContent(message: ChatMessage, content: string): ChatMessage {
  return { ...message, content }
}

function truncateSystemSlot(
  messages: ChatMessage[],
  kind: PromptSlotKind,
  model: string,
  maxTokens: number
): ChatMessage[] {
  return messages.map((message) => {
    if (classifyPromptSlot(message) !== kind) return message
    const text = getMessageContentText(message.content)
    if (text.length < maxTokens * 2) return message
    const truncated = truncateToTokenLimit(text, maxTokens, model)
    if (truncated === text) return message
    return replaceSystemContent(message, truncated)
  })
}

/**
 * Fits the prompt using slot-aware trimming.
 *
 * Drop / shrink order when over budget:
 * 1. Oldest conversational/evidence turns (via {@link fitPromptToTokenBudget})
 * 2. Truncate session-memory / summary system blocks
 * 3. Truncate task block
 * 4. Truncate inventory / current-context snapshot last
 */
export function fitPromptWithSlots(
  messages: ChatMessage[],
  tokenBudget: number = LOCAL_COPILOT_PROMPT_TOKEN_BUDGET,
  model: string = DEFAULT_MODEL
): ChatMessage[] {
  let next = fitPromptToTokenBudget(messages, tokenBudget, model)
  if (estimateChatMessagesTokens(next, model) <= tokenBudget) return next

  next = truncateSystemSlot(next, 'summary', model, 600)
  if (estimateChatMessagesTokens(next, model) <= tokenBudget) return next

  next = truncateSystemSlot(next, 'task', model, 300)
  if (estimateChatMessagesTokens(next, model) <= tokenBudget) return next

  next = truncateSystemSlot(next, 'snapshot', model, 2_000)
  if (estimateChatMessagesTokens(next, model) <= tokenBudget) return next

  return fitPromptToTokenBudget(next, tokenBudget, model)
}
