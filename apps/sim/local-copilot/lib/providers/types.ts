import type { LocalCopilotToolDefinition } from '@/local-copilot/lib/types'

export type ChatMessageContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      source: { type: 'base64'; media_type: string; data: string }
    }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ChatMessageContentPart[]
  toolCallId?: string
  toolCalls?: Array<{
    id: string
    name: string
    arguments: string
  }>
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  tools?: LocalCopilotToolDefinition[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface ChatCompletionChunk {
  type: 'text' | 'tool_call' | 'done'
  content?: string
  toolCall?: {
    id: string
    name: string
    arguments: string
  }
  finishReason?: string
  usage?: TokenUsage
}

export interface LocalCopilotProvider {
  id: string
  chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, undefined>
}
