import { createLogger } from '@sim/logger'
import { db } from '@sim/db'
import { workflow } from '@sim/db/schema'
import { desc, eq } from 'drizzle-orm'
import { executeTool } from '@/lib/copilot/tool-executor/executor'
import { ensureHandlersRegistered } from '@/lib/copilot/tool-executor/register-handlers'
import { createServerToolHandler } from '@/lib/copilot/tools/registry/server-tool-adapter'
import { getRegisteredServerToolNames } from '@/lib/copilot/tools/server/router'
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
  read: 'Reads a workspace file by canonical VFS path (from glob or workspaceFiles in context).',
  glob: 'Finds workspace files by glob pattern (e.g. files/**/*.csv).',
  grep: 'Searches file contents under a workspace path pattern.',
  create_file: 'Creates or overwrites workspace files at canonical VFS paths under files/.',
  create_file_folder: 'Creates a folder under the workspace files tree.',
  workspace_file:
    'Reads, creates, appends, updates, or deletes workspace files by path or file id.',
  download_to_workspace_file: 'Downloads a URL into a workspace file.',
  user_table:
    'Creates, reads, and updates workspace tables — operations include create, get, get_schema, insert_row, batch_insert_rows, query_rows, update_row, add_column, import_file, create_from_file.',
  knowledge_base:
    'Manages knowledge bases — operations include create, get, list, query (semantic search), add_file (ingest document), update, delete, add_connector, sync_connector.',
  open_resource: 'Opens a workspace resource (workflow, file, table, knowledge base) in the UI.',
  materialize_file: 'Materializes chat-uploaded files into workspace files or table imports.',
  generate_image:
    'Generates an image from a text prompt (no workflow). Uses hosted/workspace keys automatically. Optional outputs.files path to save under files/.',
  search_online:
    'Live web search (Exa or Serper when keys are configured). Use for current events and live data — no workflow required.',
  enrichment_run:
    'Runs a one-off table enrichment lookup inline (no table/workflow required).',
  function_execute:
    'Runs JavaScript, Python, or shell in a secure sandbox (E2B when enabled). Mount workspace files/tables via inputs; save results with outputs.files or outputPath. Python and shell require e2b.enabled in context.',
  edit_content:
    'Writes or patches file content. For pptx/docx/pdf/xlsx, pairs with workspace file patch flows and compiles via E2B when e2b.docSandboxEnabled is true.',
}

/** Tools delegated to registered Mothership/copilot server handlers. */
export const MOTHERSHIP_DELEGATED_TOOL_NAMES = [
  'run_workflow',
  'run_workflow_until_block',
  'get_workflow_run_options',
  'query_logs',
  'get_workflow_data',
  'list_integration_tools',
  'read',
  'glob',
  'grep',
  'create_file',
  'create_file_folder',
  'workspace_file',
  'download_to_workspace_file',
  'user_table',
  'knowledge_base',
  'open_resource',
  'materialize_file',
  'generate_image',
  'search_online',
  'enrichment_run',
  'function_execute',
  'edit_content',
] as const

const COPILOT_SERVER_TOOL_NAMES = new Set(getRegisteredServerToolNames())

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

function normalizeWorkflowName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
}

function matchWorkflowByName(
  workflows: NonNullable<LocalCopilotStructuredContext['workspaceWorkflows']>,
  name: string
): string | undefined {
  const normalized = normalizeWorkflowName(name)
  if (!normalized) return undefined

  const exact = workflows.find(
    (workflowRow) => normalizeWorkflowName(workflowRow.name) === normalized
  )
  if (exact) return exact.id

  const partialMatches = workflows.filter((workflowRow) => {
    const workflowName = normalizeWorkflowName(workflowRow.name)
    return workflowName.includes(normalized) || normalized.includes(workflowName)
  })
  if (partialMatches.length === 1) return partialMatches[0].id

  return undefined
}

async function resolveWorkflowIdFromDatabase(
  workspaceId: string,
  args: Record<string, unknown>
): Promise<string | undefined> {
  const nameHint =
    (typeof args.workflowName === 'string' && args.workflowName.trim()) ||
    (typeof args.name === 'string' && args.name.trim() && !isUuid(args.name.trim())
      ? args.name.trim()
      : '') ||
    (typeof args.workflowId === 'string' &&
    args.workflowId.trim() &&
    !isUuid(args.workflowId.trim())
      ? args.workflowId.trim()
      : '')

  if (!nameHint) return undefined

  const rows = await db
    .select({ id: workflow.id, name: workflow.name })
    .from(workflow)
    .where(eq(workflow.workspaceId, workspaceId))
    .orderBy(desc(workflow.updatedAt))
    .limit(50)

  const workflows = rows.map((row) => ({
    id: row.id,
    name: row.name ?? 'Untitled workflow',
  }))

  return matchWorkflowByName(workflows, nameHint)
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

async function executeCopilotServerTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const handler = createServerToolHandler(toolName)
  const result = await handler(args, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    userPermission: ctx.userPermission ?? 'write',
    chatId: ctx.chatId,
    abortSignal: ctx.abortSignal,
    copilotToolExecution: true,
  })

  return {
    toolName,
    success: result.success,
    result: result.output ?? (result.error ? { error: result.error } : {}),
    error: result.error,
  }
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

  if (!workflowId && ctx.workspaceId) {
    workflowId = await resolveWorkflowIdFromDatabase(ctx.workspaceId, enrichedArgs)
  }

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

  if (COPILOT_SERVER_TOOL_NAMES.has(toolName)) {
    const result = await executeCopilotServerTool(toolName, enrichedArgs, ctx)
    if (!result.success) {
      logger.warn('Copilot server tool failed', { toolName, error: result.error })
    }
    return result
  }

  const result = await executeTool(toolName, enrichedArgs, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    workflowId: workflowId ?? ctx.workflowId ?? '',
    chatId: ctx.chatId,
    abortSignal: ctx.abortSignal,
    copilotToolExecution: true,
    userPermission: ctx.userPermission,
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
