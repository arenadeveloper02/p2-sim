import type { ToolExecutionContext as CopilotToolExecutionContext } from '@/lib/copilot/tool-executor/types'
import { getLocalCopilotSandboxProfile } from '@/local-copilot/lib/context/e2b-capabilities'
import type { ToolExecutionContext } from '@/local-copilot/lib/tools/executor'

/** Maps local copilot context to the Mothership/copilot server tool handler shape. */
export function toCopilotServerToolContext(
  ctx: ToolExecutionContext,
  workflowId?: string
): CopilotToolExecutionContext {
  const sandboxProfile = getLocalCopilotSandboxProfile()
  return {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    workflowId: workflowId ?? ctx.workflowId ?? ctx.structuredContext.workflow?.id ?? '',
    userPermission: ctx.userPermission ?? '',
    chatId: ctx.chatId,
    messageId: ctx.messageId,
    abortSignal: ctx.abortSignal,
    copilotToolExecution: true,
    ...(sandboxProfile ? { sandboxProfile } : {}),
    ...(ctx.activeToolCallId?.trim() ? { toolCallId: ctx.activeToolCallId.trim() } : {}),
    ...(ctx.fileIntentChannelId?.trim()
      ? { parentToolCallId: ctx.fileIntentChannelId.trim() }
      : {}),
    ...(ctx.billingAttribution ? { billingAttribution: ctx.billingAttribution } : {}),
  }
}
