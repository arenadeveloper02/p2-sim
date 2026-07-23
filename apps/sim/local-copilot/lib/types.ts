import type { BlockState, Variable, WorkflowState } from '@sim/workflow-types/workflow'
import type { MothershipResource } from '@/lib/copilot/resources/types'

export interface LocalCopilotE2bCapabilities {
  enabled: boolean
  docSandboxEnabled: boolean
  supportedCodeLanguages: Array<'javascript' | 'python' | 'shell'>
}

export type LocalCopilotProviderId =
  | 'openai'
  | 'anthropic'
  | 'azure-openai'
  | 'bedrock'
  | 'gemini'
  | 'openai-compatible'

export interface LocalCopilotConfig {
  enabled: boolean
  provider: LocalCopilotProviderId
  model: string
  apiKey?: string
  baseUrl?: string
}

export interface LocalCopilotWorkspaceContext {
  id: string
  name: string
  environment: 'cloud' | 'self_hosted'
}

export interface LocalCopilotCredentialMetadata {
  credentialId: string
  provider: string
  status: 'connected' | 'missing' | 'expired'
  scopes?: string[]
  displayName?: string
}

export interface LocalCopilotConnectedIntegration {
  credentialId: string
  providerId: string
  displayName?: string | null
  role?: string | null
}

export interface LocalCopilotExecutionContext {
  lastRunStatus: 'success' | 'failed' | 'running' | 'unknown'
  logs: LocalCopilotLogEntry[]
  failedBlockId: string | null
  error: string | null
  executionId?: string
}

export interface LocalCopilotLogEntry {
  blockId?: string
  blockName?: string
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp?: string
}

export interface LocalCopilotStructuredContext {
  workspace: LocalCopilotWorkspaceContext
  connectedIntegrations: LocalCopilotConnectedIntegration[]
  /** Configured workspace/personal env key names (values never included). */
  envVariables: string[]
  /** When true, platform-hosted API keys may be injected at execution time. */
  hostedKeysAvailable: boolean
  /** E2B sandbox availability for code execution and document compilation. */
  e2b?: LocalCopilotE2bCapabilities
  workflow?: {
    id: string
    name: string
    blocks: WorkflowState['blocks']
    edges: WorkflowState['edges']
    variables: WorkflowState['variables']
    loops: WorkflowState['loops']
    parallels: WorkflowState['parallels']
    credentials: LocalCopilotCredentialMetadata[]
  }
  /** Present on home chat when no workflow is open. */
  workspaceWorkflows?: Array<{
    id: string
    name: string
    isDeployed?: boolean
    lastRunAt?: string | null
  }>
  /** Actionable hint injected when existing workflows should be preferred over creating new ones. */
  guidance?: string
  knowledgeBases?: Array<{ id: string; name: string; description?: string | null }>
  tables?: Array<{ id: string; name: string; description?: string | null }>
  workspaceFiles?: Array<{ id: string; name: string; path: string; type: string; size: number }>
  /** User-created workspace skills (name + description). Load full body via load_user_skill. */
  skills?: Array<{ id: string; name: string; description: string }>
  /**
   * High-confidence user memories (preferences/entities) for this user + workspace.
   * Full CRUD via the `user_memory` tool.
   */
  userMemories?: Array<{
    key: string
    value: string
    memoryType: string
    source: string
    confidence: number
  }>
  execution: LocalCopilotExecutionContext
  availableIntegrations: string[]
  availableBlocks: LocalCopilotBlockSummary[]
  selectedBlockId?: string
}

export interface LocalCopilotBlockSummary {
  id: string
  name: string
  category: string
  description: string
  authMode?: string
}

export type WorkflowPatchOperation =
  | { operation: 'add_block'; block: BlockState }
  | { operation: 'update_block'; blockId: string; updates: Partial<BlockState> }
  | { operation: 'remove_block'; blockId: string }
  | { operation: 'add_edge'; edge: WorkflowState['edges'][number] }
  | { operation: 'remove_edge'; edgeId: string }
  | { operation: 'update_variable'; variableId: string; updates: Partial<Variable> }
  | { operation: 'add_variable'; variable: Variable }
  | { operation: 'remove_variable'; variableId: string }

export interface WorkflowPatch {
  type: 'workflow_patch'
  summary: string
  changes: WorkflowPatchOperation[]
  requiresConfirmation: true
  warnings?: string[]
  recommendations?: string[]
}

export interface PatchValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface LocalCopilotToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface LocalCopilotToolCallRecord {
  toolCallId: string
  toolName: string
  arguments: Record<string, unknown>
  result?: unknown
  status: 'pending' | 'completed' | 'failed'
}

export type LocalCopilotStreamEvent =
  | { type: 'text_delta'; content: string }
  | {
      type: 'tool_call_start'
      toolCallId: string
      toolName: string
      args?: Record<string, unknown>
    }
  | {
      type: 'tool_call_result'
      toolCallId: string
      toolName: string
      success: boolean
      output: unknown
      error?: string
      resources?: MothershipResource[]
    }
  | {
      type: 'status'
      message: string
      toolCallId?: string
      toolName?: string
    }
  | { type: 'patch_proposed'; patch: WorkflowPatch; patchId: string }
  | { type: 'recommendations'; items: string[] }
  | { type: 'error'; message: string }
  | {
      type: 'done'
      messageId: string
      /** Aggregated model tokens for this turn (used for mothership billing). */
      usage?: {
        model: string
        inputTokens: number
        outputTokens: number
      }
    }

export interface LocalCopilotMessageContent {
  text: string
  patchId?: string
  recommendations?: string[]
  toolCalls?: LocalCopilotToolCallRecord[]
}
