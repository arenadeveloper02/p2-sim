import { getAnthropicAutomaticCacheControl } from '@/lib/anthropic/prompt-cache'
import { getMessageContentText } from '@/local-copilot/lib/providers/message-content'
import type { ChatMessage, ChatMessageContentPart } from '@/local-copilot/lib/providers/types'

export type AnthropicSystemBlock = {
  type: 'text'
  text: string
  cache_control?: ReturnType<typeof getAnthropicAutomaticCacheControl>
}

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      source: { type: 'base64'; media_type: string; data: string }
    }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

function toAnthropicUserContent(
  content: string | ChatMessageContentPart[]
): string | AnthropicContentBlock[] {
  if (typeof content === 'string') return content

  return content.map((part) => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text }
    }
    return {
      type: 'image',
      source: part.source,
    }
  })
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

/**
 * Drops tool results that are not preceded by a matching assistant tool_use turn.
 */
export function sanitizeToolMessagePairing(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  let pendingToolUseIds = new Set<string>()

  for (const message of messages) {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      out.push(message)
      pendingToolUseIds = new Set(message.toolCalls.map((call) => call.id))
      continue
    }

    if (message.role === 'tool') {
      const toolCallId = message.toolCallId ?? ''
      if (toolCallId && pendingToolUseIds.has(toolCallId)) {
        out.push(message)
        pendingToolUseIds.delete(toolCallId)
      }
      continue
    }

    pendingToolUseIds = new Set()
    out.push(message)
  }

  return out
}

/**
 * Converts internal chat messages to Anthropic `/v1/messages` format.
 * Batches consecutive tool results into a single user message per Anthropic requirements.
 */
export function convertMessagesToAnthropic(messages: ChatMessage[]): {
  system: AnthropicSystemBlock[] | undefined
  anthropicMessages: AnthropicMessage[]
} {
  const systemParts: string[] = []
  const sanitized = sanitizeToolMessagePairing(messages)
  const anthropicMessages: AnthropicMessage[] = []

  for (let index = 0; index < sanitized.length; index++) {
    const message = sanitized[index]

    if (message.role === 'system') {
      const text = getMessageContentText(message.content).trim()
      if (text) {
        systemParts.push(text)
      }
      continue
    }

    if (message.role === 'tool') {
      const toolResults: AnthropicContentBlock[] = []
      while (index < sanitized.length && sanitized[index].role === 'tool') {
        const toolMessage = sanitized[index]
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolMessage.toolCallId ?? '',
          content: getMessageContentText(toolMessage.content),
        })
        index += 1
      }
      index -= 1

      if (toolResults.length > 0) {
        anthropicMessages.push({ role: 'user', content: toolResults })
      }
      continue
    }

    if (message.role === 'assistant' && message.toolCalls?.length) {
      const content: AnthropicContentBlock[] = []
      const assistantText = getMessageContentText(message.content).trim()
      if (assistantText) {
        content.push({ type: 'text', text: assistantText })
      }
      for (const call of message.toolCalls) {
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(call.arguments || '{}') as Record<string, unknown>
        } catch {
          input = {}
        }
        content.push({ type: 'tool_use', id: call.id, name: call.name, input })
      }
      anthropicMessages.push({ role: 'assistant', content })
      continue
    }

    if (message.role === 'user') {
      anthropicMessages.push({
        role: 'user',
        content: toAnthropicUserContent(message.content),
      })
      continue
    }

    anthropicMessages.push({
      role: 'assistant',
      content: getMessageContentText(message.content),
    })
  }

  const system: AnthropicSystemBlock[] | undefined =
    systemParts.length === 0
      ? undefined
      : systemParts.map((text, index) =>
          index === 0
            ? { type: 'text' as const, text, cache_control: getAnthropicAutomaticCacheControl() }
            : { type: 'text' as const, text }
        )

  return { system, anthropicMessages }
}
