import type { ToolExecutionContext as CopilotToolExecutionContext } from '@/lib/copilot/tool-executor/types'
import type { ToolExecutionContext } from '@/local-copilot/lib/tools/executor'

/** Maps local copilot context to the Mothership/copilot server tool handler shape. */
export function toCopilotServerToolContext(
  ctx: ToolExecutionContext,
  workflowId?: string
): CopilotToolExecutionContext {
  return {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    workflowId:
      workflowId ?? ctx.workflowId ?? ctx.structuredContext.workflow?.id ?? '',
    userPermission: ctx.userPermission ?? 'write',
    chatId: ctx.chatId,
    messageId: ctx.messageId,
    abortSignal: ctx.abortSignal,
    copilotToolExecution: true,
  }
}
