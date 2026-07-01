import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { getAllBlocks } from '@/blocks/registry'
import { fetchLogDetail } from '@/lib/logs/fetch-log-detail'
import { listLogs } from '@/lib/logs/list-logs'
import {
  buildLocalCopilotContext,
  contextToPromptJson,
} from '@/local-copilot/lib/context/build-context'
import { generateWorkflowPatchFromRequest } from '@/local-copilot/lib/patches/generate'
import { validateWorkflowPatch, validateWorkflowState } from '@/local-copilot/lib/patches/validate'
import { getToolDefinition } from '@/local-copilot/lib/tools/definitions'
import {
  executeMothershipDelegatedTool,
  isMothershipDelegatedTool,
} from '@/local-copilot/lib/tools/mothership-delegated-tools'
import { runCreateWorkflowTool, runEditWorkflowTool } from '@/local-copilot/lib/tools/workflow-mutations'
import type { LocalCopilotStructuredContext, WorkflowPatch } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotToolExecutor')

export interface ToolExecutionContext {
  userId: string
  workspaceId: string
  workflowId?: string
  chatId?: string
  abortSignal?: AbortSignal
  userPermission?: string
  structuredContext: LocalCopilotStructuredContext
  selectedBlockId?: string
}

function requireWorkflowContext(ctx: ToolExecutionContext): NonNullable<LocalCopilotStructuredContext['workflow']> {
  if (!ctx.workflowId || !ctx.structuredContext.workflow) {
    throw new Error('Open a workflow in the editor to use this action.')
  }
  return ctx.structuredContext.workflow
}

export interface ToolExecutionResult {
  toolName: string
  success: boolean
  result: unknown
  error?: string
  patch?: WorkflowPatch
  /** Set when create_workflow succeeds — subsequent tools use this workflow. */
  createdWorkflowId?: string
}

function guardCreateWorkflowWhenExistingAvailable(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): ToolExecutionResult | null {
  if (args.confirmNewWorkflow === true) return null

  const existing = ctx.structuredContext.workspaceWorkflows ?? []
  if (existing.length === 0) return null

  const requestedName =
    typeof args.name === 'string' ? args.name.trim().toLowerCase() : ''

  const matchByName = requestedName
    ? existing.find((workflow) => workflow.name.toLowerCase() === requestedName)
    : undefined

  const target = matchByName ?? (existing.length === 1 ? existing[0] : undefined)
  if (!target) return null

  const reason = matchByName
    ? `A workflow named "${target.name}" already exists.`
    : `This workspace has one existing workflow ("${target.name}").`

  const error = `${reason} Use get_workflow_run_options then run_workflow to execute it, or edit_workflow to modify it. Pass confirmNewWorkflow: true only if the user explicitly asked for a separate new workflow.`

  logger.info('Blocked create_workflow in favor of existing workflow', {
    existingWorkflowId: target.id,
    requestedName: requestedName || null,
  })

  return {
    toolName: 'create_workflow',
    success: false,
    error,
    result: {
      useRunWorkflowInstead: true,
      existingWorkflowId: target.id,
      existingWorkflowName: target.name,
      existingWorkflows: existing.map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        isDeployed: workflow.isDeployed ?? false,
      })),
      followUpHint: `Call get_workflow_run_options({ workflowId: "${target.id}" }) then run_workflow.`,
    },
  }
}

export async function executeLocalCopilotTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const definition = getToolDefinition(toolName)
  if (!definition) {
    throw new Error(`Unknown tool: ${toolName}`)
  }

  logger.info('Executing Arena Copilot tool', { toolName, workflowId: ctx.workflowId })

  if (isMothershipDelegatedTool(toolName)) {
    return executeMothershipDelegatedTool(toolName, args, ctx)
  }

  switch (toolName) {
    case 'create_workflow': {
      const blocked = guardCreateWorkflowWhenExistingAvailable(args, ctx)
      if (blocked) return blocked

      const mutation = await runCreateWorkflowTool(args, {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        workflowId: ctx.workflowId,
        chatId: ctx.chatId,
        abortSignal: ctx.abortSignal,
      })
      const output = mutation.output as Record<string, unknown> | undefined
      const createdWorkflowId =
        typeof output?.workflowId === 'string' ? output.workflowId : undefined
      return {
        toolName,
        success: mutation.success,
        result: mutation.output ?? { error: mutation.error },
        error: mutation.error,
        ...(createdWorkflowId ? { createdWorkflowId } : {}),
      }
    }

    case 'edit_workflow': {
      const mutation = await runEditWorkflowTool(args, {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        workflowId: ctx.workflowId,
        chatId: ctx.chatId,
        abortSignal: ctx.abortSignal,
      })
      return {
        toolName,
        success: mutation.success,
        result: mutation.output ?? { error: mutation.error },
        error: mutation.error,
      }
    }

    case 'get_workflow_context':
      return {
        toolName,
        success: true,
        result: JSON.parse(contextToPromptJson(ctx.structuredContext)),
      }

    case 'get_available_blocks': {
      const category =
        typeof args.category === 'string' && args.category.trim() ? args.category.trim() : undefined
      const blocks = ctx.structuredContext.availableBlocks.filter(
        (block) => !category || block.category === category
      )
      return { toolName, success: true, result: { blocks } }
    }

    case 'get_available_integrations':
      return {
        toolName,
        success: true,
        result: {
          integrations: ctx.structuredContext.availableIntegrations,
          connectedIntegrations: ctx.structuredContext.connectedIntegrations,
          envVariables: ctx.structuredContext.envVariables,
          hostedKeysAvailable: ctx.structuredContext.hostedKeysAvailable,
        },
      }

    case 'validate_workflow': {
      const state = requireWorkflowContext(ctx)
      const validation = validateWorkflowState({
        blocks: state.blocks,
        edges: state.edges,
        loops: state.loops,
        parallels: state.parallels,
        variables: state.variables,
      })
      return { toolName, success: true, result: validation }
    }

    case 'generate_workflow_patch': {
      requireWorkflowContext(ctx)
      const userRequest = String(args.userRequest ?? '')
      const targetBlockId =
        typeof args.targetBlockId === 'string' ? args.targetBlockId : ctx.selectedBlockId
      const patch = await generateWorkflowPatchFromRequest({
        context: ctx.structuredContext,
        userRequest,
        targetBlockId,
      })
      return { toolName, success: true, result: patch, patch }
    }

    case 'get_execution_logs': {
      const limit = typeof args.limit === 'number' ? args.limit : 10
      const executionId =
        typeof args.executionId === 'string' ? args.executionId : undefined
      const logs = await listLogs(
        {
          workspaceId: ctx.workspaceId,
          ...(ctx.workflowId ? { workflowIds: ctx.workflowId } : {}),
          limit,
          executionId,
          sortBy: 'date',
          sortOrder: 'desc',
        },
        ctx.userId
      )
      return { toolName, success: true, result: logs }
    }

    case 'explain_error': {
      const errorMessage = String(args.errorMessage ?? ctx.structuredContext.execution.error ?? '')
      const blockId =
        typeof args.blockId === 'string'
          ? args.blockId
          : ctx.structuredContext.execution.failedBlockId ?? undefined
      const executionId =
        typeof args.executionId === 'string'
          ? args.executionId
          : ctx.structuredContext.execution.executionId

      let logDetail = null
      if (executionId) {
        logDetail = await fetchLogDetail({
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          lookupColumn: 'executionId',
          lookupValue: executionId,
        })
      }

      return {
        toolName,
        success: true,
        result: {
          errorMessage,
          blockId,
          executionId,
          analysis: buildErrorAnalysis(errorMessage, blockId, ctx.structuredContext),
          logDetail,
        },
      }
    }

    case 'search_docs': {
      const query = String(args.query ?? '').toLowerCase()
      const matches = getAllBlocks()
        .filter(
          (block) =>
            block.name.toLowerCase().includes(query) ||
            block.description.toLowerCase().includes(query) ||
            block.type.toLowerCase().includes(query)
        )
        .slice(0, 10)
        .map((block) => ({
          type: block.type,
          name: block.name,
          description: block.description,
          docsLink: block.docsLink,
          category: block.category,
        }))
      return { toolName, success: true, result: { query: args.query, matches } }
    }

    case 'propose_workflow_patch': {
      const workflowState = requireWorkflowContext(ctx)
      const patch: WorkflowPatch = {
        type: 'workflow_patch',
        summary: String(args.summary ?? 'Workflow changes'),
        changes: Array.isArray(args.changes) ? (args.changes as WorkflowPatch['changes']) : [],
        requiresConfirmation: true,
        warnings: Array.isArray(args.warnings) ? (args.warnings as string[]) : undefined,
        recommendations: Array.isArray(args.recommendations)
          ? (args.recommendations as string[])
          : undefined,
      }
      const validation = validateWorkflowPatch(patch, workflowState)
      if (!validation.valid) {
        return {
          toolName,
          success: false,
          result: { error: 'Patch validation failed', validation },
          error: 'Patch validation failed',
        }
      }
      return { toolName, success: true, result: patch, patch }
    }

    default:
      throw new Error(`Unhandled tool: ${toolName}`)
  }
}

function buildErrorAnalysis(
  errorMessage: string,
  blockId: string | undefined,
  context: LocalCopilotStructuredContext
): Record<string, unknown> {
  const block = blockId ? context.workflow?.blocks[blockId] : undefined
  const lower = errorMessage.toLowerCase()

  const rootCause =
    lower.includes('credential') || lower.includes('unauthorized')
      ? 'Credential or authentication issue'
      : lower.includes('rate limit')
        ? 'API rate limit exceeded'
        : lower.includes('variable') || lower.includes('undefined')
          ? 'Missing or invalid variable reference'
          : lower.includes('timeout')
            ? 'Request timeout'
            : 'Block execution failure'

  return {
    rootCause,
    failingBlock: block
      ? { id: blockId, type: block.type, name: block.name }
      : blockId
        ? { id: blockId }
        : null,
    suggestedFixes: suggestFixes(lower, block?.type),
    testSteps: [
      'Verify credentials are connected for required integrations',
      'Check block configuration and required inputs',
      'Run a single-block test if available',
      'Review execution logs for the failing step',
    ],
  }
}

function suggestFixes(errorLower: string, blockType?: string): string[] {
  const fixes: string[] = []
  if (errorLower.includes('credential') || errorLower.includes('unauthorized')) {
    fixes.push('Reconnect or select the correct credential in workspace settings')
  }
  if (errorLower.includes('rate limit')) {
    fixes.push('Add retry logic or reduce request frequency')
  }
  if (errorLower.includes('variable')) {
    fixes.push('Ensure referenced variables exist and match expected types')
  }
  if (blockType) {
    fixes.push(`Review ${blockType} block configuration against integration docs`)
  }
  if (fixes.length === 0) {
    fixes.push('Inspect block inputs and upstream data shape')
  }
  return fixes
}

export async function refreshToolContext(
  params: Omit<ToolExecutionContext, 'structuredContext'> & { selectedBlockId?: string }
): Promise<ToolExecutionContext> {
  const structuredContext = await buildLocalCopilotContext({
    userId: params.userId,
    workspaceId: params.workspaceId,
    ...(params.workflowId ? { workflowId: params.workflowId } : {}),
    selectedBlockId: params.selectedBlockId,
  })
  return { ...params, structuredContext }
}
