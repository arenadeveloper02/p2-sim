import { createLogger } from '@sim/logger'
import { executeTool } from '@/lib/copilot/tool-executor/executor'
import { ensureHandlersRegistered } from '@/lib/copilot/tool-executor/register-handlers'
import { TOOL_RUNTIME_SCHEMAS } from '@/lib/copilot/generated/tool-schemas-v1'
import type { LocalCopilotToolDefinition, LocalCopilotStructuredContext } from '@/local-copilot/lib/types'
import type { ToolExecutionContext, ToolExecutionResult } from '@/local-copilot/lib/tools/executor'

const logger = createLogger('LocalCopilotMothershipDelegatedTools')

const DELEGATED_TOOL_DESCRIPTIONS: Record<string, string> = {
  run_workflow:
    'Executes a workflow and returns block outputs, executionId, and status. Call get_workflow_run_options first when trigger inputs are unknown.',
  run_workflow_until_block:
    'Runs a workflow until a specific block completes, then returns partial outputs.',
  get_workflow_run_options:
    'Returns runnable triggers, input schemas, and mock payloads for a workflow before running it.',
  query_logs:
    'Lists or inspects workflow execution logs and block outputs. Use executionId from run_workflow.',
  get_workflow_data:
    'Loads workflow structure and metadata by workflowId (useful on home chat when no workflow is open).',
  list_integration_tools:
    'Lists available operations for a connected integration service (e.g. firecrawl, slack).',
}

export const MOTHERSHIP_DELEGATED_TOOL_NAMES = [
  'run_workflow',
  'run_workflow_until_block',
  'get_workflow_run_options',
  'query_logs',
  'get_workflow_data',
  'list_integration_tools',
] as const

export type MothershipDelegatedToolName = (typeof MOTHERSHIP_DELEGATED_TOOL_NAMES)[number]

export const WORKFLOW_SCOPED_DELEGATED_TOOLS = new Set<MothershipDelegatedToolName>([
  'run_workflow',
  'run_workflow_until_block',
  'get_workflow_run_options',
  'get_workflow_data',
])

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

function matchWorkflowByName(
  workflows: NonNullable<LocalCopilotStructuredContext['workspaceWorkflows']>,
  name: string
): string | undefined {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return undefined

  const exact = workflows.find((workflow) => workflow.name.toLowerCase() === normalized)
  if (exact) return exact.id

  const partialMatches = workflows.filter((workflow) =>
    workflow.name.toLowerCase().includes(normalized)
  )
  if (partialMatches.length === 1) return partialMatches[0].id

  return undefined
}

/**
 * Resolves a workflow ID for delegated tools on home chat where no workflow is open.
 */
export function resolveWorkflowIdForDelegatedTool(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): string | undefined {
  const fromContext =
    (typeof ctx.workflowId === 'string' && ctx.workflowId.trim()) ||
    ctx.structuredContext.workflow?.id

  const rawArg =
    (typeof args.workflowId === 'string' && args.workflowId.trim()) ||
    (typeof args.id === 'string' && args.id.trim()) ||
    undefined

  if (rawArg) {
    if (isUuid(rawArg)) return rawArg
    const workflows = ctx.structuredContext.workspaceWorkflows ?? []
    const byName = matchWorkflowByName(workflows, rawArg)
    if (byName) return byName
  }

  if (fromContext && isUuid(fromContext)) return fromContext

  for (const field of ['workflowName', 'name', 'workflow'] as const) {
    const value = typeof args[field] === 'string' ? args[field].trim() : ''
    if (!value) continue
    const workflows = ctx.structuredContext.workspaceWorkflows ?? []
    const byName = matchWorkflowByName(workflows, value)
    if (byName) return byName
  }

  const workflows = ctx.structuredContext.workspaceWorkflows ?? []
  if (workflows.length === 1) return workflows[0].id

  return undefined
}

function buildMissingWorkflowIdError(
  structuredContext: LocalCopilotStructuredContext
): ToolExecutionResult {
  const workflows = structuredContext.workspaceWorkflows ?? []
  const availableWorkflows = workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    isDeployed: workflow.isDeployed ?? false,
    lastRunAt: workflow.lastRunAt ?? null,
  }))

  const error =
    workflows.length === 0
      ? 'workflowId is required but this workspace has no workflows yet.'
      : `workflowId is required on home chat. Pass workflowId from workspaceWorkflows. Available: ${workflows
          .map((workflow) => `"${workflow.name}" (${workflow.id})`)
          .join(', ')}`

  return {
    toolName: 'get_workflow_run_options',
    success: false,
    result: { error, availableWorkflows },
    error,
  }
}

export function isWorkflowScopedDelegatedTool(toolName: string): boolean {
  return WORKFLOW_SCOPED_DELEGATED_TOOLS.has(toolName as MothershipDelegatedToolName)
}

export function isMothershipDelegatedTool(toolName: string): toolName is MothershipDelegatedToolName {
  return (MOTHERSHIP_DELEGATED_TOOL_NAMES as readonly string[]).includes(toolName)
}

export function buildMothershipDelegatedToolDefinitions(): LocalCopilotToolDefinition[] {
  return MOTHERSHIP_DELEGATED_TOOL_NAMES.map((name) => {
    const schema = TOOL_RUNTIME_SCHEMAS[name]?.parameters
    return {
      name,
      description: DELEGATED_TOOL_DESCRIPTIONS[name] ?? name,
      parameters: (schema ?? {
        type: 'object',
        properties: {},
        additionalProperties: false,
      }) as Record<string, unknown>,
    }
  })
}

/**
 * Runs a registered Mothership/copilot server tool handler in-process.
 */
export async function executeMothershipDelegatedTool(
  toolName: MothershipDelegatedToolName,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  ensureHandlersRegistered()

  const enrichedArgs = { ...args }
  let workflowId = resolveWorkflowIdForDelegatedTool(enrichedArgs, ctx)

  if (workflowId) {
    enrichedArgs.workflowId = workflowId
  } else if (WORKFLOW_SCOPED_DELEGATED_TOOLS.has(toolName)) {
    logger.warn('Delegated workflow tool missing workflowId', {
      toolName,
      workspaceId: ctx.workspaceId,
      workspaceWorkflowCount: ctx.structuredContext.workspaceWorkflows?.length ?? 0,
    })
    return {
      ...buildMissingWorkflowIdError(ctx.structuredContext),
      toolName,
    }
  }

  const result = await executeTool(toolName, enrichedArgs, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    workflowId: workflowId ?? ctx.workflowId ?? '',
    chatId: ctx.chatId,
    abortSignal: ctx.abortSignal,
    copilotToolExecution: true,
  })

  if (!result.success) {
    logger.warn('Delegated Mothership tool failed', {
      toolName,
      workflowId: workflowId ?? null,
      error: result.error,
    })
  }

  return {
    toolName,
    success: result.success,
    result: result.output ?? (result.error ? { error: result.error } : {}),
    error: result.error,
  }
}
