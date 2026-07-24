/**
 * Legacy Local Arena Copilot source references keyed only on chat + model round.
 * Different user messages in the same chat collide on round 0, so a second turn
 * can be dropped by `onConflictDoNothing` on the hashed event key.
 */
export function buildLegacyLocalCopilotRoundSourceReference(params: {
  chatId?: string
  conversationId?: string
  workspaceId: string
  round: number
}): string {
  if (params.chatId) {
    return `arena-copilot:${params.chatId}:round-${params.round}`
  }
  if (params.conversationId) {
    return `arena-copilot:${params.conversationId}:round-${params.round}`
  }
  return `arena-copilot:${params.workspaceId}:round-${params.round}`
}

/**
 * Message-scoped Local turn billing key. Distinct messages in the same chat
 * never share an event key, and retries of the same turn remain idempotent.
 */
export function buildLocalCopilotTurnEventKey(params: {
  messageId: string
  chatId?: string
  conversationId?: string
  workspaceId: string
}): string {
  const messageId = params.messageId.trim()
  const scope = params.chatId ?? params.conversationId ?? params.workspaceId
  return `arena-copilot:${scope}:message:${messageId}`
}

/**
 * Component-level event key under a Local turn (model or tool line item).
 */
export function buildLocalCopilotComponentEventKey(params: {
  turnEventKey: string
  component: 'model' | 'tool'
  componentId: string
}): string {
  return `${params.turnEventKey}:${params.component}:${params.componentId}`
}
