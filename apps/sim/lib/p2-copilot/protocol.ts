/** SSE events streamed from the P2 copilot brain (must match apps/p2-copilot-brain). */

export type BrainEvent =
  | { type: 'text'; delta: string }
  | { type: 'thinking'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: unknown; isError: boolean }
  | { type: 'complete'; status: 'complete' | 'error' | 'cancelled'; message?: string }
  | { type: 'error'; message: string }

export interface P2ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: P2ToolCallStatus[]
}

export interface P2ToolCallStatus {
  id: string
  name: string
  status: 'running' | 'done' | 'error'
  result?: unknown
}
