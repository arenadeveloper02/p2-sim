import type { Edge } from 'reactflow'
import { truncate } from '@sim/utils/string'
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

/** Recent user/assistant turns kept verbatim in chat history. */
export const LOCAL_COPILOT_RECENT_TURNS_FULL = 6

/** Hard cap on prior chat rows considered for history. */
export const LOCAL_COPILOT_MAX_HISTORY_MESSAGES = 50

/** Per-message character cap in recent history (approximate token guard). */
export const LOCAL_COPILOT_MAX_MESSAGE_CHARS = 8_000

export type WorkflowContextDetail = 'full' | 'compact'

export interface CompactChatHistoryOptions {
  recentTurnsFull?: number
  maxMessages?: number
  maxMessageChars?: number
}

export interface BuildContextPromptOptions {
  workflowDetail?: WorkflowContextDetail
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
 * Keeps the last K turns verbatim and compresses older turns into one system summary.
 */
export function compactChatHistory(
  messages: ChatMessage[],
  options: CompactChatHistoryOptions = {}
): ChatMessage[] {
  const recentTurnsFull = options.recentTurnsFull ?? LOCAL_COPILOT_RECENT_TURNS_FULL
  const maxMessages = options.maxMessages ?? LOCAL_COPILOT_MAX_HISTORY_MESSAGES
  const maxMessageChars = options.maxMessageChars ?? LOCAL_COPILOT_MAX_MESSAGE_CHARS

  const trimmed = messages.slice(-maxMessages)
  const turns = groupHistoryTurns(trimmed)

  if (turns.length <= recentTurnsFull) {
    return truncateMessageContents(trimmed, maxMessageChars)
  }

  const olderTurns = turns.slice(0, turns.length - recentTurnsFull)
  const recentTurns = turns.slice(turns.length - recentTurnsFull)

  const summary = summarizeHistoryTurns(olderTurns)
  const recentMessages = truncateMessageContents(
    recentTurns.flatMap((turn) => turn.messages),
    maxMessageChars
  )

  if (!summary) return recentMessages

  return [
    {
      role: 'system',
      content: `Earlier conversation (compressed summary of ${olderTurns.length} prior turns):\n${summary}`,
    },
    ...recentMessages,
  ]
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

  let keptTurns = [...turns]
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
  const workflowPayload = context.workflow
    ? buildWorkflowPromptPayload(context.workflow, workflowDetail, context.selectedBlockId)
    : null

  return JSON.stringify(
    sanitizeForLlm({
      workspace: context.workspace,
      connectedIntegrations: context.connectedIntegrations,
      envVariables: context.envVariables,
      hostedKeysAvailable: context.hostedKeysAvailable,
      e2b: context.e2b,
      guidance: context.guidance,
      workflow: workflowPayload,
      workspaceWorkflows: context.workspaceWorkflows,
      knowledgeBases: context.knowledgeBases,
      tables: context.tables,
      workspaceFiles: context.workspaceFiles,
      skills: context.skills,
      execution: context.execution,
      availableIntegrations: context.availableIntegrations,
      availableBlocks: context.availableBlocks,
      selectedBlockId: context.selectedBlockId,
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
    note: 'Block subBlock values omitted to save context. Use edit_workflow or inspect tools for full params.',
    state: buildCompactWorkflowState(workflow, selectedBlockId),
    credentials: workflow.credentials,
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

function summarizeHistoryTurns(turns: HistoryTurn[]): string {
  return turns
    .map((turn, index) => {
      const lines = turn.messages.map((message) => {
        const label = message.role === 'user' ? 'User' : 'Assistant'
        return `- ${label}: ${truncate(getMessageContentText(message.content).replace(/\s+/g, ' ').trim(), 400)}`
      })
      return `Turn ${index + 1}:\n${lines.join('\n')}`
    })
    .join('\n\n')
}

function truncateMessageContents(messages: ChatMessage[], maxChars: number): ChatMessage[] {
  return messages.map((message) => {
    if (typeof message.content !== 'string') return message
    return {
      ...message,
      content:
        message.content.length > maxChars
          ? `${truncate(message.content, maxChars)}\n\n[... message truncated for context budget]`
          : message.content,
    }
  })
}
