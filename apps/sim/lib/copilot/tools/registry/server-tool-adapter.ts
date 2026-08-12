import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import type { ToolExecutionResult, ToolHandler } from '@/lib/copilot/tool-executor/types'
import { normalizeGenerateImageArgs } from '@/lib/copilot/tools/server/image/normalize-args'
import { routeExecution } from '@/lib/copilot/tools/server/router'
import { normalizeEditWorkflowArgs } from '@/lib/copilot/tools/server/workflow/edit-workflow/normalize-args'

const logger = createLogger('ServerToolAdapter')

const MISSING_EDIT_OPERATIONS_ERROR =
  'operations are required and must be a non-empty array — pass { operations: [{ block_id, operation_type, params }] }'

const MISSING_GENERATE_IMAGE_PROMPT_ERROR =
  'prompt is required — pass { prompt: "detailed image description" }'

export function createServerToolHandler(toolId: string): ToolHandler {
  return async (params, context): Promise<ToolExecutionResult> => {
    let enrichedParams = { ...params }
    if (!enrichedParams.workflowId && context.workflowId)
      enrichedParams.workflowId = context.workflowId
    if (!enrichedParams.workspaceId && context.workspaceId)
      enrichedParams.workspaceId = context.workspaceId

    if (toolId === 'edit_workflow') {
      enrichedParams = normalizeEditWorkflowArgs(enrichedParams)
      if (!Array.isArray(enrichedParams.operations) || enrichedParams.operations.length === 0) {
        return {
          success: false,
          error: MISSING_EDIT_OPERATIONS_ERROR,
          output: { success: false, error: MISSING_EDIT_OPERATIONS_ERROR },
        }
      }
    }

    if (toolId === 'generate_image') {
      enrichedParams = normalizeGenerateImageArgs(enrichedParams)
      if (typeof enrichedParams.prompt !== 'string' || !enrichedParams.prompt.trim()) {
        return {
          success: false,
          error: MISSING_GENERATE_IMAGE_PROMPT_ERROR,
          output: { success: false, error: MISSING_GENERATE_IMAGE_PROMPT_ERROR },
        }
      }
    }

    try {
      const result = await routeExecution(toolId, enrichedParams, {
        userId: context.userId,
        workspaceId: context.workspaceId,
        billingAttribution: context.billingAttribution,
        userPermission: context.userPermission ?? undefined,
        chatId: context.chatId,
        messageId: context.messageId,
        parentToolCallId: context.parentToolCallId,
        abortSignal: context.abortSignal,
      })

      const rec =
        result && typeof result === 'object' && !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : null
      if (rec?.success === false) {
        const message =
          (typeof rec.error === 'string' && rec.error) ||
          (typeof rec.message === 'string' && rec.message) ||
          `${toolId} failed`
        return { success: false, error: message, output: result }
      }
      return { success: true, output: result }
    } catch (error) {
      const message = toError(error).message
      logger.error('Server tool execution failed', {
        toolId,
        error: message,
        abortSignalAborted: context.abortSignal?.aborted ?? false,
      })
      return {
        success: false,
        error: `[${toolId}] ${message}`,
      }
    }
  }
}
