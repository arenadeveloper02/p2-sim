/**
 * Our Copilot Agent - Type Definitions
 * Centralized types for the copilot system
 */

export interface CopilotRequest {
  message: string
  workflowId?: string
  chatId?: string
  userMessageId?: string
  context?: {
    workflow?: WorkflowContext
    blocks?: BlockContext[]
    logs?: LogContext[]
    knowledge?: KnowledgeContext[]
  }
  preferences?: UserPreferences
  stream?: boolean
}

export interface CopilotResponse {
  message: string
  toolCalls?: ToolCall[]
  reasoning?: string
  confidence?: number
  suggestions?: string[]
  followUpQuestions?: string[]
}

export interface ToolCall {
  id: string
  toolName: string
  parameters: Record<string, any>
  result?: any
  status: 'pending' | 'completed' | 'failed'
  error?: string
  executionTime?: number
}

export interface WorkflowContext {
  workflowId: string
  name: string
  description?: string
  blocks: BlockContext[]
  executions: ExecutionContext[]
  variables?: Record<string, any>
}

export interface BlockContext {
  id: string
  type: string
  name: string
  config: Record<string, any>
  status: 'active' | 'inactive' | 'error' | 'running'
  inputs?: Record<string, any>
  outputs?: Record<string, any>
  lastExecution?: ExecutionContext
}

export interface ExecutionContext {
  id: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  startTime: Date
  endTime?: Date
  duration?: number
  inputs?: Record<string, any>
  outputs?: Record<string, any>
  error?: string
  logs?: LogEntry[]
}

export interface LogContext {
  executionId: string
  blockId?: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  timestamp: Date
  metadata?: Record<string, any>
}

export interface LogEntry extends LogContext {
  id: string
}

export interface KnowledgeContext {
  id: string
  title: string
  content: string
  type: 'documentation' | 'example' | 'template' | 'faq'
  tags: string[]
  relevanceScore?: number
}

export interface UserPreferences {
  llmProvider: 'anthropic' | 'openai'
  model?: string
  temperature: number
  maxTokens: number
  responseStyle: 'concise' | 'detailed' | 'friendly' | 'technical'
  autoExecuteTools: boolean
  showReasoning: boolean
  enableMemory: boolean
  language?: string
  timezone?: string
}

export interface UserProfile {
  userId: string
  preferences: UserPreferences
  skills: string[]
  frequentlyUsedTools: string[]
  learningHistory: LearningEvent[]
  statistics: UserStatistics
}

export interface LearningEvent {
  toolName: string
  success: boolean
  executionTime: number
  timestamp: Date
  context: string
  feedback?: 'positive' | 'negative' | 'neutral'
}

export interface UserStatistics {
  totalConversations: number
  totalToolExecutions: number
  averageResponseTime: number
  successRate: number
  mostUsedTools: Array<{ toolName: string; count: number }>
  favoriteWorkflows: Array<{ workflowId: string; count: number }>
}

export interface AgentCapability {
  name: string
  description: string
  tools: string[]
  enabled: boolean
  configuration?: Record<string, any>
}

export interface AgentState {
  status: 'idle' | 'thinking' | 'executing' | 'responding' | 'error'
  currentTask?: string
  progress?: number
  lastActivity: Date
  capabilities: AgentCapability[]
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  toolCalls?: ToolCall[]
  context?: CopilotRequest['context']
  metadata?: Record<string, any>
}

export interface Conversation {
  id: string
  title?: string
  userId: string
  workflowId?: string
  messages: ConversationMessage[]
  createdAt: Date
  updatedAt: Date
  context?: CopilotRequest['context']
  summary?: string
  tags: string[]
}

export interface IntentAnalysis {
  intent: string
  confidence: number
  entities: Array<{
    type: string
    value: string
    confidence: number
  }>
  selectedTools: Array<{
    toolName: string
    confidence: number
    parameters: Record<string, any>
  }>
  reasoning: string
}

export interface ToolExecutionPlan {
  steps: Array<{
    id: string
    toolName: string
    parameters: Record<string, any>
    dependencies: string[]
    parallelizable: boolean
  }>
  estimatedTime: number
  confidence: number
}

export interface CopilotConfig {
  defaultProvider: 'anthropic' | 'openai'
  defaultModel: string
  maxConversations: number
  maxMessageHistory: number
  memoryRetention: number // days
  toolTimeout: number // seconds
  enableStreaming: boolean
  enableTools: boolean
  enabledCapabilities: string[]
  rateLimiting: {
    requestsPerMinute: number
    tokensPerMinute: number
  }
}

export interface StreamingResponse {
  id: string
  type: 'message' | 'tool_call' | 'error' | 'complete'
  content?: string
  toolCall?: ToolCall
  error?: string
  progress?: number
  metadata?: Record<string, any>
}

export interface CopilotMetrics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  toolExecutions: number
  tokensUsed: number
  cost: number
  userSatisfaction: number
  errorRate: number
}

// Error types
export class CopilotError extends Error {
  constructor(
    message: string,
    public code: string,
    public severity: 'low' | 'medium' | 'high' = 'medium',
    public recoverable: boolean = true
  ) {
    super(message)
    this.name = 'CopilotError'
  }
}

export class ToolExecutionError extends CopilotError {
  constructor(
    toolName: string,
    message: string,
    public originalError?: Error
  ) {
    super(`Tool ${toolName} failed: ${message}`, 'TOOL_EXECUTION_ERROR', 'medium')
    this.name = 'ToolExecutionError'
  }
}

export class IntentAnalysisError extends CopilotError {
  constructor(message: string) {
    super(`Intent analysis failed: ${message}`, 'INTENT_ANALYSIS_ERROR', 'medium')
    this.name = 'IntentAnalysisError'
  }
}

export class LLMError extends CopilotError {
  constructor(
    provider: string,
    message: string,
    public statusCode?: number
  ) {
    super(`LLM Provider ${provider} error: ${message}`, 'LLM_ERROR', 'high')
    this.name = 'LLMError'
  }
}

// Event types for event-driven architecture
export interface CopilotEvent {
  type: string
  timestamp: Date
  data: any
  userId?: string
  conversationId?: string
}

export interface ToolExecutionEvent extends CopilotEvent {
  type: 'tool_execution_started' | 'tool_execution_completed' | 'tool_execution_failed'
  data: {
    toolName: string
    parameters: Record<string, any>
    result?: any
    error?: string
    executionTime: number
  }
}

export interface MessageEvent extends CopilotEvent {
  type: 'message_received' | 'message_processed' | 'message_sent'
  data: {
    messageId: string
    content: string
    role: string
    toolCalls?: ToolCall[]
  }
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
