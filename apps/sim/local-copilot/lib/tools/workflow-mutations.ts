import { getErrorMessage, toError } from '@sim/utils/errors'
import type { ToolCallResult } from '@/lib/copilot/request/types'
import { executeCreateWorkflow } from '@/lib/copilot/tools/handlers/workflow/mutations'
import { editWorkflowServerTool } from '@/lib/copilot/tools/server/workflow/edit-workflow'
import {
  normalizeEditWorkflowArgs,
  resolveEditWorkflowOperations,
} from '@/lib/copilot/tools/server/workflow/edit-workflow/normalize-args'
import type { EditWorkflowParams } from '@/lib/copilot/tools/server/workflow/edit-workflow/types'

export interface LocalCopilotMutationContext {
  userId: string
  workspaceId: string
  workflowId?: string
  chatId?: string
  abortSignal?: AbortSignal
}

export { normalizeEditWorkflowArgs, resolveEditWorkflowOperations }

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
      workspaceId: ctx.workspaceId,
    },
    execContext
  )
}

export async function runEditWorkflowTool(
  args: Record<string, unknown>,
  ctx: LocalCopilotMutationContext
): Promise<ToolCallResult> {
  const normalized = normalizeEditWorkflowArgs(args)
  const workflowId =
    (typeof normalized.workflowId === 'string' && normalized.workflowId.trim()) || ctx.workflowId
  if (!workflowId) {
    return {
      success: false,
      error: 'workflowId is required — create a workflow first with create_workflow',
    }
  }

  const operations = resolveEditWorkflowOperations(normalized)
  if (!operations) {
    return {
      success: false,
      error:
        'operations are required and must be a non-empty array — pass { operations: [{ block_id, operation_type, params }] }',
    }
  }

  try {
    const result = await editWorkflowServerTool.execute(
      {
        workflowId,
        operations: operations as EditWorkflowParams['operations'],
        ...(typeof normalized.currentUserWorkflow === 'string'
          ? { currentUserWorkflow: normalized.currentUserWorkflow }
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
    return {
      success: false,
      error: getErrorMessage(error, toError(error).message),
      output: undefined,
    }
  }
}
