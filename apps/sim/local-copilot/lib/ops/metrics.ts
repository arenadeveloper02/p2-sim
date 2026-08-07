import { createLogger } from '@sim/logger'

const logger = createLogger('LocalCopilotOpsMetrics')

export const LOCAL_OPS_COUNTERS = {
  turnVerified: 'turn_verified',
  turnFailed: 'turn_failed',
  mutationFailed: 'mutation_failed',
  authDenied: 'auth_denied',
  injectionStripped: 'injection_stripped',
  costRecorded: 'cost_recorded',
  spendCapHit: 'spend_cap_hit',
} as const

export type LocalOpsCounter = (typeof LOCAL_OPS_COUNTERS)[keyof typeof LOCAL_OPS_COUNTERS]

export interface LocalOpsEvent {
  counter: LocalOpsCounter
  userId?: string
  workspaceId?: string
  workflowId?: string
  conversationId?: string
  chatId?: string
  runId?: string
  metadata?: Record<string, unknown>
}

/**
 * Emits a structured ops counter for log-based metrics.
 *
 * Stays free of database imports so client bundles can strip forged controls
 * without pulling server-only persistence into the browser graph.
 */
export function recordLocalOpsEvent(event: LocalOpsEvent): void {
  logger.info('local_copilot_ops', {
    counter: event.counter,
    userId: event.userId ?? null,
    workspaceId: event.workspaceId ?? null,
    workflowId: event.workflowId ?? null,
    conversationId: event.conversationId ?? null,
    chatId: event.chatId ?? null,
    runId: event.runId ?? null,
    ...(event.metadata ?? {}),
  })
}
