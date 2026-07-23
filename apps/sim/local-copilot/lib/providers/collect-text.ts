import type { ChatMessage, LocalCopilotProvider } from '@/local-copilot/lib/providers/types'

/**
 * Streams a chat completion and concatenates the text chunks into a single
 * trimmed string. Shared by small utility calls (engagement status lines,
 * chat title generation) that only need plain text back.
 */
export async function collectCompletionText(params: {
  provider: LocalCopilotProvider
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}): Promise<string> {
  let text = ''
  for await (const chunk of params.provider.chatCompletionStream({
    model: params.model,
    messages: params.messages,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    signal: params.signal,
  })) {
    if (chunk.type === 'text' && chunk.content) {
      text += chunk.content
    }
  }
  return text.trim()
}
