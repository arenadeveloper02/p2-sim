import type { Edge } from 'reactflow'
import { getAccurateTokenCount, truncateToTokenLimit } from '@/lib/tokenization/estimators'
import { sanitizeForExport } from '@/lib/workflows/sanitization/json-sanitizer'
import { getMessageContentText } from '@/local-copilot/lib/providers/message-content'
import type { ChatMessage } from '@/local-copilot/lib/providers/types'
import { sanitizeForLlm } from '@/local-copilot/lib/security/sanitize'
import type { LocalCopilotStructuredContext } from '@/local-copilot/lib/types'

/** Fallback tiktoken model when the configured provider model has no encoding. */
const DEFAULT_TOKEN_COUNT_MODEL = 'gpt-4o'

/** Total prompt budget before calling the LLM (input side; leaves room for tools + output). */
export const LOCAL_COPILOT_PROMPT_TOKEN_BUDGET = 120_000

/** Workflow JSON above this size is sent as block summaries instead of full state. */
export const LOCAL_COPILOT_WORKFLOW_FULL_STATE_TOKEN_BUDGET = 24_000

/** Recent user/assistant turns kept verbatim (full message bodies) in chat history. */
export const LOCAL_COPILOT_RECENT_TURNS_FULL = 6

/**
 * Hard cap on prior chat rows considered for history.
 * Sized for ~6 tool-heavy turns (user + assistant + tool result rows).
 */
export const LOCAL_COPILOT_MAX_HISTORY_MESSAGES = 150

export type WorkflowContextDetail = 'full' | 'compact'

export interface CompactChatHistoryOptions {
  recentTurnsFull?: number
  maxMessages?: number
  /**
   * @deprecated Older turns are never extractively summarized anymore.
   * Session memory (injected separately) covers aged context. Kept for call-site compat.
   */
  sessionMemoryPresent?: boolean
}

export type ContextInventoryMode = 'full' | 'delta' | 'unchanged'

export interface BuildContextPromptOptions {
  workflowDetail?: WorkflowContextDetail
  /**
   * When `delta` or `unchanged`, omit duplicate workspace inventory arrays —
   * the `Workspace snapshot:` system block is authoritative.
   */
  inventoryMode?: ContextInventoryMode
  /** Snapshot revision echoed into slim context payloads. */
  snapshotRevision?: string
}

interface HistoryTurn {
  messages: ChatMessage[]
}

/**
 * Counts tokens for chat messages with js-tiktoken (`getAccurateTokenCount`).
 * Falls back to chars/4 only if encoding fails inside the tokenizer helper.
 */
export function estimateChatMessagesTokens(
  messages: ChatMessage[],
  model: string = DEFAULT_TOKEN_COUNT_MODEL
): number {
  return messages.reduce(
    (sum, message) => sum + getAccurateTokenCount(getMessageContentText(message.content), model),
    0
  )
}

/**
 * Estimates tokens for tool definitions sent alongside the prompt (not counted by message budget).
 */
export function estimateToolDefinitionTokens(
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>,
  model: string = DEFAULT_TOKEN_COUNT_MODEL
): number {
  if (tools.length === 0) return 0
  try {
    return getAccurateTokenCount(JSON.stringify(tools), model)
  } catch {
    return Math.ceil(JSON.stringify(tools).length / 4)
  }
}

/**
 * Keeps the last K turns verbatim with full message bodies.
 * Older turns are omitted here — structured session memory (injected by the
 * orchestrator) is the summary for aged conversational + technical context.
 * Overall size is still enforced by {@link fitPromptToTokenBudget}.
 */
export function compactChatHistory(
  messages: ChatMessage[],
  options: CompactChatHistoryOptions = {}
): ChatMessage[] {
  const recentTurnsFull = options.recentTurnsFull ?? LOCAL_COPILOT_RECENT_TURNS_FULL
  const maxMessages = options.maxMessages ?? LOCAL_COPILOT_MAX_HISTORY_MESSAGES

  const trimmed = messages.slice(-maxMessages)
  const turns = groupHistoryTurns(trimmed)

  if (turns.length <= recentTurnsFull) {
    return trimmed
  }

  return turns.slice(turns.length - recentTurnsFull).flatMap((turn) => turn.messages)
}

/**
 * Drops oldest non-system chat rows until the prompt fits the token budget.
 */
export function fitPromptToTokenBudget(
  messages: ChatMessage[],
  tokenBudget: number = LOCAL_COPILOT_PROMPT_TOKEN_BUDGET,
  model: string = DEFAULT_TOKEN_COUNT_MODEL
): ChatMessage[] {
  if (estimateChatMessagesTokens(messages, model) <= tokenBudget) return messages

  const systemMessages = messages.filter((message) => message.role === 'system')
  const conversational = messages.filter((message) => message.role !== 'system')
  const turns = groupHistoryTurns(conversational)

  const keptTurns = [...turns]
  while (
    keptTurns.length > 1 &&
    estimateChatMessagesTokens(
      [...systemMessages, ...keptTurns.flatMap((turn) => turn.messages)],
      model
    ) > tokenBudget
  ) {
    keptTurns.shift()
  }

  let trimmedConversation = keptTurns.flatMap((turn) => turn.messages)

  if (
    trimmedConversation.length === 1 &&
    estimateChatMessagesTokens([...systemMessages, ...trimmedConversation], model) > tokenBudget
  ) {
    const last = trimmedConversation[0]
    const overhead = estimateChatMessagesTokens(systemMessages, model)
    const remainingTokens = Math.max(125, tokenBudget - overhead)
    const lastText = getMessageContentText(last.content)
    const truncatedText = truncateToTokenLimit(lastText, remainingTokens, model)
    trimmedConversation = [
      {
        ...last,
        content:
          typeof last.content === 'string'
            ? truncatedText
            : [
                {
                  type: 'text' as const,
                  text: truncatedText,
                },
                ...last.content.filter((part) => part.type === 'image'),
              ],
      },
    ]
  }

  return [...systemMessages, ...trimmedConversation]
}

/**
 * Picks full vs compact workflow detail based on serialized workflow size.
 */
export function resolveWorkflowContextDetail(
  context: LocalCopilotStructuredContext,
  workflowFullStateTokenBudget: number = LOCAL_COPILOT_WORKFLOW_FULL_STATE_TOKEN_BUDGET,
  model: string = DEFAULT_TOKEN_COUNT_MODEL
): WorkflowContextDetail {
  if (!context.workflow) return 'full'

  const fullWorkflowJson = JSON.stringify(
    buildWorkflowPromptPayload(context.workflow, 'full', context.selectedBlockId),
    null,
    2
  )
  if (getAccurateTokenCount(fullWorkflowJson, model) <= workflowFullStateTokenBudget) return 'full'
  return 'compact'
}

/**
 * Builds the JSON string embedded in the system context message.
 */
export function buildContextPromptPayload(
  context: LocalCopilotStructuredContext,
  options: BuildContextPromptOptions = {}
): string {
  const workflowDetail = options.workflowDetail ?? 'full'
  const inventoryMode = options.inventoryMode ?? 'full'
  const slimInventory = inventoryMode === 'delta' || inventoryMode === 'unchanged'
  const workflowPayload = context.workflow
    ? buildWorkflowPromptPayload(context.workflow, workflowDetail, context.selectedBlockId)
    : null

  return JSON.stringify(
    sanitizeForLlm({
      workspace: context.workspace,
      connectedIntegrations: context.connectedIntegrations,
      envVariables: slimInventory ? undefined : context.envVariables,
      hostedKeysAvailable: context.hostedKeysAvailable,
      e2b: context.e2b,
      guidance: slimInventory
        ? 'Workspace inventory lives in the Workspace snapshot system block (delta/unchanged mode). Prefer that over inventing resource lists.'
        : context.guidance,
      workflow: workflowPayload,
      workspaceWorkflows: slimInventory ? undefined : context.workspaceWorkflows,
      knowledgeBases: slimInventory ? undefined : context.knowledgeBases,
      tables: slimInventory ? undefined : context.tables,
      workspaceFiles: slimInventory ? undefined : context.workspaceFiles,
      skills: slimInventory ? undefined : context.skills,
      userMemories: context.userMemories,
      execution: context.execution,
      availableIntegrations: context.availableIntegrations,
      // Full ~300-block catalog omitted — use get_available_blocks / get_blocks_metadata.
      availableBlocksNote:
        'Block catalog omitted to save tokens. Call get_available_blocks or get_blocks_metadata for the types you need.',
      selectedBlockId: context.selectedBlockId,
      ...(slimInventory
        ? {
            inventoryMode,
            ...(options.snapshotRevision ? { snapshotRevision: options.snapshotRevision } : {}),
          }
        : {}),
    }),
    null,
    2
  )
}

function buildWorkflowPromptPayload(
  workflow: NonNullable<LocalCopilotStructuredContext['workflow']>,
  detail: WorkflowContextDetail,
  selectedBlockId?: string
) {
  if (detail === 'full') {
    return {
      id: workflow.id,
      name: workflow.name,
      detail: 'full' as const,
      state: sanitizeForExport({
        blocks: workflow.blocks,
        edges: workflow.edges,
        loops: workflow.loops,
        parallels: workflow.parallels,
        variables: workflow.variables,
        metadata: { name: workflow.name },
      }).state,
      credentials: workflow.credentials,
    }
  }

  return {
    id: workflow.id,
    name: workflow.name,
    detail: 'compact' as const,
    note: 'Block subBlock values omitted to save context. Call get_workflow_context with blockNames (or blockIds) for the blocks you need before edit_workflow.',
    state: buildCompactWorkflowState(workflow, selectedBlockId),
    credentials: workflow.credentials,
  }
}

export interface WorkflowBlockInspectionSelector {
  blockIds?: string[]
  blockNames?: string[]
}

/**
 * Returns full sanitized detail for selected blocks (by id and/or display name).
 * Used when compact workflow context omits subBlock values.
 */
export function buildWorkflowBlockInspection(
  workflow: NonNullable<LocalCopilotStructuredContext['workflow']>,
  selector: WorkflowBlockInspectionSelector
) {
  const idSet = new Set(
    (selector.blockIds ?? []).map((id) => id.trim()).filter((id) => id.length > 0)
  )
  const nameSet = new Set(
    (selector.blockNames ?? [])
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name.length > 0)
  )

  const matched = Object.values(workflow.blocks).filter((block) => {
    if (idSet.has(block.id)) return true
    const name = typeof block.name === 'string' ? block.name.trim().toLowerCase() : ''
    return name.length > 0 && nameSet.has(name)
  })

  const sanitized = sanitizeForExport({
    blocks: Object.fromEntries(matched.map((block) => [block.id, block])),
    edges: [],
    loops: {},
    parallels: {},
    variables: {},
    metadata: { name: workflow.name },
  }).state

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    requestedBlockIds: [...idSet],
    requestedBlockNames: [...nameSet],
    matchedCount: matched.length,
    blocks: sanitized.blocks,
    note:
      matched.length === 0
        ? 'No blocks matched. Use display names or UUIDs from the compact workflow context.'
        : undefined,
  }
}

function buildCompactWorkflowState(
  workflow: NonNullable<LocalCopilotStructuredContext['workflow']>,
  selectedBlockId?: string
) {
  const blocks = Object.values(workflow.blocks).map((block) => {
    const summary = {
      id: block.id,
      type: block.type,
      name: block.name,
      enabled: block.enabled,
      subBlockKeys: Object.keys(block.subBlocks ?? {}),
    }

    if (selectedBlockId && block.id === selectedBlockId) {
      return { ...summary, subBlocks: block.subBlocks }
    }

    return summary
  })

  const edges = workflow.edges.map((edge: Edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  }))

  const variables = Object.fromEntries(
    Object.entries(workflow.variables ?? {}).map(([key, variable]) => [
      key,
      {
        id: variable.id,
        name: variable.name,
        type: variable.type,
      },
    ])
  )

  return {
    blocks,
    edges,
    variables,
    loops: workflow.loops,
    parallels: workflow.parallels,
  }
}

function groupHistoryTurns(messages: ChatMessage[]): HistoryTurn[] {
  const turns: HistoryTurn[] = []
  let current: ChatMessage[] = []

  for (const message of messages) {
    if (message.role === 'user' && current.length > 0) {
      turns.push({ messages: current })
      current = []
    }
    current.push(message)
  }

  if (current.length > 0) {
    turns.push({ messages: current })
  }

  return turns
}
