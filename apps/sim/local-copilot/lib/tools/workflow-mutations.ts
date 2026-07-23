import { getErrorMessage, toError } from '@sim/utils/errors'
import type { ToolCallResult } from '@/lib/copilot/request/types'
import { editWorkflowServerTool } from '@/lib/copilot/tools/server/workflow/edit-workflow'
import { executeCreateWorkflow } from '@/lib/copilot/tools/handlers/workflow/mutations'
import type { EditWorkflowParams } from '@/lib/copilot/tools/server/workflow/edit-workflow/types'

export interface LocalCopilotMutationContext {
  userId: string
  workspaceId: string
  workflowId?: string
  chatId?: string
  abortSignal?: AbortSignal
}

export async function runCreateWorkflowTool(
  args: Record<string, unknown>,
  ctx: LocalCopilotMutationContext
): Promise<ToolCallResult> {
  const execContext = {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    workflowId: ctx.workflowId ?? '',
    chatId: ctx.chatId,
    abortSignal: ctx.abortSignal,
  }

  return executeCreateWorkflow(
    {
      name: typeof args.name === 'string' ? args.name : '',
      description: typeof args.description === 'string' ? args.description : undefined,
      folderId: typeof args.folderId === 'string' ? args.folderId : undefined,
      workspaceId: typeof args.workspaceId === 'string' ? args.workspaceId : ctx.workspaceId,
    },
    execContext
  )
}

export async function runEditWorkflowTool(
  args: Record<string, unknown>,
  ctx: LocalCopilotMutationContext
): Promise<ToolCallResult> {
  const workflowId =
    (typeof args.workflowId === 'string' && args.workflowId.trim()) || ctx.workflowId
  if (!workflowId) {
    return {
      success: false,
      error: 'workflowId is required — create a workflow first with create_workflow',
    }
  }

  const operations = args.operations
  if (!Array.isArray(operations) || operations.length === 0) {
    return { success: false, error: 'operations are required and must be a non-empty array' }
  }

  try {
    const result = await editWorkflowServerTool.execute(
      {
        workflowId,
        operations: operations as EditWorkflowParams['operations'],
        ...(typeof args.currentUserWorkflow === 'string'
          ? { currentUserWorkflow: args.currentUserWorkflow }
          : {}),
      },
      {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        chatId: ctx.chatId,
        abortSignal: ctx.abortSignal,
        userStopSignal: ctx.abortSignal,
      }
    )

    const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : {}
    if (record.success === false) {
      return {
        success: false,
        error: typeof record.error === 'string' ? record.error : 'edit_workflow failed',
        output: result,
      }
    }

    return { success: true, output: result }
  } catch (error) {
    return { success: false, error: getErrorMessage(error, toError(error).message), output: undefined }
  }
}
