import { writeAuditLog } from '@/local-copilot/lib/persistence/store'

export async function logCopilotAction(params: {
  userId: string
  workspaceId: string
  workflowId?: string
  conversationId?: string
  patchId?: string
  action: string
  summary?: string
  status?: 'success' | 'failure' | 'rejected'
  metadata?: Record<string, unknown>
}): Promise<void> {
  await writeAuditLog(params)
}
