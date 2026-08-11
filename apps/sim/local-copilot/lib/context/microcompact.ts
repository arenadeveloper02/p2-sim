import type { ChatMessage } from '@/local-copilot/lib/providers/types'

/** Keep this many most-recent tool rounds verbatim; older tool bodies are fingerprinted. */
export const LOCAL_COPILOT_MICROCOMPACT_KEEP_RECENT_ROUNDS = 2

const CLEARED_PREFIX = '[Old tool result cleared'

export interface MicrocompactResult {
  messages: ChatMessage[]
  clearedCount: number
  charsFreed: number
}

export interface MicrocompactOptions {
  keepRecentRounds?: number
}

/**
 * Zero-cost compaction: replace aged tool-result bodies with short fingerprints.
 * Preserves user/assistant text and tool_use / tool_result pairing (same toolCallId).
 */
export function microcompactMessages(
  messages: ChatMessage[],
  options: MicrocompactOptions = {}
): MicrocompactResult {
  const keepRecentRounds = options.keepRecentRounds ?? LOCAL_COPILOT_MICROCOMPACT_KEEP_RECENT_ROUNDS

  const rounds = findToolRoundIndices(messages)
  if (rounds.length <= keepRecentRounds) {
    return { messages, clearedCount: 0, charsFreed: 0 }
  }

  const clearRounds = rounds.slice(0, Math.max(0, rounds.length - keepRecentRounds))
  const clearIndexSet = new Set(clearRounds.flat())
  if (clearIndexSet.size === 0) {
    return { messages, clearedCount: 0, charsFreed: 0 }
  }

  const toolNameByCallId = buildToolNameByCallId(messages)
  let clearedCount = 0
  let charsFreed = 0

  const next = messages.map((message, index) => {
    if (message.role !== 'tool' || !clearIndexSet.has(index)) return message

    const content = typeof message.content === 'string' ? message.content : ''
    if (content.startsWith(CLEARED_PREFIX)) return message

    const toolName = message.toolCallId ? toolNameByCallId.get(message.toolCallId) : undefined
    const fingerprint = fingerprintToolResult(toolName, content)
    if (fingerprint === content) return message

    clearedCount += 1
    charsFreed += Math.max(0, content.length - fingerprint.length)
    return { ...message, content: fingerprint }
  })

  return { messages: next, clearedCount, charsFreed }
}

/**
 * Applies {@link microcompactMessages} and replaces the array contents in place.
 */
export function applyMicrocompactInPlace(
  messages: ChatMessage[],
  options?: MicrocompactOptions
): Omit<MicrocompactResult, 'messages'> {
  const result = microcompactMessages(messages, options)
  if (result.clearedCount === 0) {
    return { clearedCount: 0, charsFreed: 0 }
  }
  messages.splice(0, messages.length, ...result.messages)
  return { clearedCount: result.clearedCount, charsFreed: result.charsFreed }
}

function findToolRoundIndices(messages: ChatMessage[]): number[][] {
  const rounds: number[][] = []
  let index = 0

  while (index < messages.length) {
    const message = messages[index]
    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      const toolIndices: number[] = []
      let cursor = index + 1
      while (cursor < messages.length && messages[cursor].role === 'tool') {
        toolIndices.push(cursor)
        cursor += 1
      }
      if (toolIndices.length > 0) rounds.push(toolIndices)
      index = cursor
      continue
    }
    index += 1
  }

  return rounds
}

function buildToolNameByCallId(messages: ChatMessage[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.toolCalls) continue
    for (const call of message.toolCalls) {
      map.set(call.id, call.name)
    }
  }
  return map
}

function fingerprintToolResult(toolName: string | undefined, content: string): string {
  const name = toolName?.trim() || 'tool'
  let successPart = ''
  try {
    const parsed = JSON.parse(content) as { success?: unknown }
    if (typeof parsed.success === 'boolean') {
      successPart = ` success=${parsed.success}`
    }
  } catch {
    // Non-JSON tool bodies still get a name-only fingerprint.
  }
  return `${CLEARED_PREFIX} — ${name}${successPart}]`
}
