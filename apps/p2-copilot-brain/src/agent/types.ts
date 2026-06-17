import type { BrainToolSchema } from '@/protocol'

export interface ToolCall {
  id: string
  name: string
  /** Raw JSON arguments string as produced by the model. */
  argsJson: string
}

export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string }

export interface ModelStepInput {
  systemPrompt: string
  messages: AgentMessage[]
  tools: BrainToolSchema[]
}

export interface ModelStepResult {
  /** Assistant text produced this step (may be empty when only tools are called). */
  text: string
  toolCalls: ToolCall[]
}

/** Called with incremental assistant text as it streams from the model. */
export type TextSink = (delta: string) => void

export interface ModelClient {
  streamStep(input: ModelStepInput, onText: TextSink): Promise<ModelStepResult>
}
