/**
 * Context Manager for Sim Copilot
 * Handles token limits, conversation pruning, and smart context management
 */

import type { AIMessage } from './ai-provider'

// Approximate token counts (rough estimates)
const CHARS_PER_TOKEN = 4
const MAX_CONTEXT_TOKENS = 150000 // Leave headroom below 200K limit
const MAX_MESSAGES_TO_KEEP = 20
const SUMMARY_THRESHOLD = 10

/**
 * Estimate token count for a string
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Estimate total tokens in messages array
 */
export function estimateMessagesTokens(messages: AIMessage[]): number {
  return messages.reduce((total, msg) => {
    return total + estimateTokens(msg.content || '') + 10 // 10 tokens overhead per message
  }, 0)
}

/**
 * Prune conversation to fit within token limits
 * Strategy: Keep system prompt + last N messages
 */
export function pruneConversation(
  messages: AIMessage[],
  maxTokens: number = MAX_CONTEXT_TOKENS
): AIMessage[] {
  if (messages.length === 0) return messages

  const systemMessages = messages.filter(m => m.role === 'system')
  const nonSystemMessages = messages.filter(m => m.role !== 'system')

  // Always keep system messages
  let result = [...systemMessages]
  let currentTokens = estimateMessagesTokens(systemMessages)

  // Add messages from most recent, working backwards
  const reversedNonSystem = [...nonSystemMessages].reverse()
  const messagesToAdd: AIMessage[] = []

  for (const msg of reversedNonSystem) {
    const msgTokens = estimateTokens(msg.content || '') + 10
    if (currentTokens + msgTokens > maxTokens) {
      break
    }
    messagesToAdd.unshift(msg)
    currentTokens += msgTokens
  }

  // Limit to max messages
  const limitedMessages = messagesToAdd.slice(-MAX_MESSAGES_TO_KEEP)

  return [...result, ...limitedMessages]
}

/**
 * Truncate tool results to reduce token usage
 */
export function truncateToolResult(result: string, maxChars: number = 5000): string {
  if (result.length <= maxChars) return result
  
  const truncated = result.slice(0, maxChars)
  return truncated + `\n\n[... truncated ${result.length - maxChars} characters. Use get_block_details for specific info.]`
}

/**
 * Compress workflow state to essential info only
 */
export function compressWorkflowState(workflow: any): any {
  if (!workflow) return workflow

  // Keep only essential block info
  const compressedBlocks = workflow.blocks?.map((block: any) => ({
    id: block.id,
    type: block.type,
    name: block.name,
    position: block.position,
    // Only include non-empty values
    values: Object.fromEntries(
      Object.entries(block.values || {}).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
    ),
  }))

  // Keep only essential edge info
  const compressedEdges = workflow.edges?.map((edge: any) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
  }))

  return {
    blocks: compressedBlocks,
    edges: compressedEdges,
    blockCount: compressedBlocks?.length || 0,
    edgeCount: compressedEdges?.length || 0,
  }
}

/**
 * Create a summary of older messages for context
 */
export function createConversationSummary(messages: AIMessage[]): string {
  if (messages.length < SUMMARY_THRESHOLD) return ''

  const topics = new Set<string>()
  const actions = new Set<string>()

  for (const msg of messages) {
    const content = msg.content?.toLowerCase() || ''
    
    // Extract topics
    if (content.includes('block')) topics.add('blocks')
    if (content.includes('workflow')) topics.add('workflow')
    if (content.includes('connect')) topics.add('connections')
    if (content.includes('google')) topics.add('google integrations')
    if (content.includes('facebook')) topics.add('facebook integrations')
    
    // Extract actions
    if (content.includes('add')) actions.add('added blocks')
    if (content.includes('remove')) actions.add('removed blocks')
    if (content.includes('update')) actions.add('updated configurations')
    if (content.includes('run')) actions.add('ran workflow')
  }

  if (topics.size === 0 && actions.size === 0) return ''

  return `[Previous conversation summary: Discussed ${[...topics].join(', ')}. Actions: ${[...actions].join(', ')}]`
}

/**
 * Smart context builder - assembles optimal context for the LLM
 */
export function buildSmartContext(
  systemPrompt: string,
  messages: AIMessage[],
  workflowState?: any,
  maxTokens: number = MAX_CONTEXT_TOKENS
): AIMessage[] {
  const result: AIMessage[] = []
  let currentTokens = 0

  // 1. Add system prompt (always)
  const systemMsg: AIMessage = { role: 'system', content: systemPrompt }
  result.push(systemMsg)
  currentTokens += estimateTokens(systemPrompt)

  // 2. Add compressed workflow state if available
  if (workflowState) {
    const compressed = compressWorkflowState(workflowState)
    const workflowContext = `Current workflow: ${JSON.stringify(compressed)}`
    currentTokens += estimateTokens(workflowContext)
  }

  // 3. Add conversation summary if long conversation
  const summary = createConversationSummary(messages)
  if (summary) {
    result.push({ role: 'system', content: summary })
    currentTokens += estimateTokens(summary)
  }

  // 4. Add recent messages (pruned to fit)
  const remainingTokens = maxTokens - currentTokens
  const prunedMessages = pruneConversation(
    messages.filter(m => m.role !== 'system'),
    remainingTokens
  )
  result.push(...prunedMessages)

  return result
}
