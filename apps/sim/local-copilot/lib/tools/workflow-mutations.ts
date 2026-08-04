import { getErrorMessage, toError } from '@sim/utils/errors'
import type { ToolCallResult } from '@/lib/copilot/request/types'
import { executeCreateWorkflow } from '@/lib/copilot/tools/handlers/workflow/mutations'
import { editWorkflowServerTool } from '@/lib/copilot/tools/server/workflow/edit-workflow'
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

  const operations = resolveEditWorkflowOperations(args)
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
    return {
      success: false,
      error: getErrorMessage(error, toError(error).message),
      output: undefined,
    }
  }
}

/**
 * Accepts common model aliases (`ops`, nested `args.operations`) for edit_workflow.
 * Also accepts a bare operations array under `params` (mis-shaped invoke_integration_tool call),
 * JSON-encoded arrays, and a singular `operation` object.
 */
function resolveEditWorkflowOperations(args: Record<string, unknown>): unknown[] | null {
  const candidates = [args.operations, args.ops, args.edits, args.params, args.operation]
  const nested =
    args.args && typeof args.args === 'object' && !Array.isArray(args.args)
      ? (args.args as Record<string, unknown>)
      : null
  if (nested) {
    candidates.push(nested.operations, nested.ops, nested.edits, nested.params, nested.operation)
  }

  for (const candidate of candidates) {
    const operations = coerceOperationsList(candidate)
    if (operations) return operations
  }
  return null
}

function coerceOperationsList(value: unknown): unknown[] | null {
  if (Array.isArray(value) && value.length > 0) return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (
      typeof record.operation_type === 'string' ||
      typeof record.operationType === 'string' ||
      typeof record.block_id === 'string' ||
      typeof record.blockId === 'string'
    ) {
      return [value]
    }
  }
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value.trim()) as unknown
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch {
      return null
    }
  }
  return null
}
