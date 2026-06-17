/**
 * Wire protocol between the Sim adapter and the P2 copilot brain.
 *
 * The Sim app (apps/sim/lib/p2-copilot) builds a ChatRequest and POSTs it to
 * the brain. The brain runs the agent loop and streams BrainEvents back as SSE.
 * When the model wants a tool, the brain calls back to Sim's tool endpoint
 * (toolExec.url) so execution stays inside Sim where the DB and auth live.
 */

export type BrainProvider = 'openai' | 'anthropic'

export interface BrainToolSchema {
  name: string
  description: string
  /** JSON schema for the tool arguments object. */
  parameters: Record<string, unknown>
}

export interface BrainChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface BrainToolExecConfig {
  /** Absolute URL of the Sim tool-execution endpoint. */
  url: string
  /** Shared internal secret used to authenticate the callback. */
  secret: string
  /** Opaque context (workflowId, workspaceId, userId) forwarded to each tool call. */
  context: Record<string, unknown>
}

export interface BrainChatRequest {
  requestId: string
  provider: BrainProvider
  model: string
  apiKey: string
  /** System context describing the workspace/workflow the user is looking at. */
  systemContext: string
  messages: BrainChatMessage[]
  tools: BrainToolSchema[]
  toolExec: BrainToolExecConfig
  /** Max reasoning/tool iterations before forcing a final answer. */
  maxSteps?: number
}

export type BrainEvent =
  | { type: 'text'; delta: string }
  | { type: 'thinking'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: unknown; isError: boolean }
  | { type: 'complete'; status: 'complete' | 'error' | 'cancelled'; message?: string }
  | { type: 'error'; message: string }

export interface ToolExecResponse {
  success: boolean
  result?: unknown
  error?: string
}
