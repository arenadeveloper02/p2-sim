import { logCopilotAction } from '@/local-copilot/lib/audit/logger'
import {
  LOCAL_OPS_COUNTERS,
  type LocalOpsEvent,
  recordLocalOpsEvent,
} from '@/local-copilot/lib/ops/metrics'

/**
 * High-signal ops events also land in the Local audit table when identity is known.
 *
 * Server-only: importing this module pulls in database access.
 */
export async function auditLocalOpsEvent(event: LocalOpsEvent): Promise<void> {
  recordLocalOpsEvent(event)
  if (!event.userId || !event.workspaceId) return
  await logCopilotAction({
    userId: event.userId,
    workspaceId: event.workspaceId,
    workflowId: event.workflowId,
    conversationId: event.conversationId,
    action: `ops_${event.counter}`,
    summary: event.counter,
    status: event.counter === LOCAL_OPS_COUNTERS.turnFailed ? 'failure' : 'success',
    metadata: {
      counter: event.counter,
      chatId: event.chatId,
      runId: event.runId,
      backend: 'local',
      ...(event.metadata ?? {}),
    },
  }).catch(() => undefined)
}
