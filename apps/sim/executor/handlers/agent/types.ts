export interface AgentInputs {
  model?: string
  responseFormat?: string | object
  tools?: ToolInput[]
  // Legacy inputs (backward compatible)
  systemPrompt?: string
  userPrompt?: string | object
  memories?: any // Legacy memory block output
  // New message array input (from messages-input subblock)
  messages?: Message[]
  // Memory configuration
  memoryType?: 'none' | 'conversation'
  conversationId?: string // Required for conversation memory type
  // LLM parameters
  temperature?: number
  maxTokens?: number
  apiKey?: string
  azureEndpoint?: string
  azureApiVersion?: string
  vertexProject?: string
  vertexLocation?: string
  vertexCredential?: string
  bedrockAccessKeyId?: string
  bedrockSecretKey?: string
  bedrockRegion?: string
  reasoningEffort?: string
  verbosity?: string
}

export interface ToolInput {
  type?: string
  schema?: any
  title?: string
  code?: string
  params?: Record<string, any>
  timeout?: number
  usageControl?: 'auto' | 'force' | 'none'
  operation?: string
  /** Database ID for custom tools (new reference format) */
  customToolId?: string
}

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
  executionId?: string
  function_call?: any
  tool_calls?: any[]
}

export interface StreamingConfig {
  shouldUseStreaming: boolean
  isBlockSelectedForOutput: boolean
  hasOutgoingConnections: boolean
}
