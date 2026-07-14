import { createLogger } from '@sim/logger'
import { db } from '@sim/db'
import { workflow } from '@sim/db/schema'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { LocalCopilotStructuredContext } from '@/local-copilot/lib/types'
import type { ToolExecutionContext, ToolExecutionResult } from '@/local-copilot/lib/tools/executor'
import { toCopilotServerToolContext } from '@/local-copilot/lib/tools/copilot-server-tool-context'
import { getLocalCopilotMemorySnapshot } from '@/local-copilot/lib/diagnostics'
import {
  MOTHERSHIP_DELEGATED_TOOL_NAMES,
  WORKFLOW_SCOPED_DELEGATED_TOOLS,
  type MothershipDelegatedToolName,
  isMothershipDelegatedTool,
  isWorkflowScopedDelegatedTool,
  buildMothershipDelegatedToolDefinitions,
} from '@/local-copilot/lib/tools/mothership-delegated-tool-defs'

export {
  MOTHERSHIP_DELEGATED_TOOL_NAMES,
  WORKFLOW_SCOPED_DELEGATED_TOOLS,
  type MothershipDelegatedToolName,
  isMothershipDelegatedTool,
  isWorkflowScopedDelegatedTool,
  buildMothershipDelegatedToolDefinitions,
}

const logger = createLogger('LocalCopilotMothershipDelegatedTools')

let copilotServerToolNames: Set<string> | null = null
let handlersRegistered = false

async function ensureCopilotToolRuntime(): Promise<Set<string>> {
  if (!handlersRegistered) {
    const loadStartedAt = Date.now()
    logger.info('Arena Copilot registering mothership tool handlers', {
      memory: getLocalCopilotMemorySnapshot(),
    })
    const { ensureHandlersRegistered } = await import('@/lib/copilot/tool-executor/register-handlers')
    ensureHandlersRegistered()
    handlersRegistered = true
    logger.info('Arena Copilot mothership tool handlers registered', {
      durationMs: Date.now() - loadStartedAt,
      memory: getLocalCopilotMemorySnapshot(),
    })
  }

  if (!copilotServerToolNames) {
    const { getRegisteredServerToolNames } = await import('@/lib/copilot/tools/server/router')
    copilotServerToolNames = new Set(getRegisteredServerToolNames())
    logger.info('Arena Copilot server tool name set cached', {
      count: copilotServerToolNames.size,
      memory: getLocalCopilotMemorySnapshot(),
    })
  }

  return copilotServerToolNames
}

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
    .where(and(eq(workflow.workspaceId, workspaceId), isNull(workflow.archivedAt)))
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

async function executeCopilotServerTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
  workflowId?: string
): Promise<ToolExecutionResult> {
  const { createServerToolHandler } = await import(
    '@/lib/copilot/tools/registry/server-tool-adapter'
  )
  const handler = createServerToolHandler(toolName)
  const result = await handler(args, toCopilotServerToolContext(ctx, workflowId))

  return {
    toolName,
    success: result.success,
    result: result.output ?? (result.error ? { error: result.error } : {}),
    error: result.error,
    resources: result.resources,
  }
}

const VARIATION_INTENT_PATTERN =
  /\b(?:variations?|versions?|options?|alternatives?|[1-5]|one|two|three|four|five)\b/i

function enrichGenerateImagePrompt(
  args: Record<string, unknown>,
  lastUserMessage?: string
): void {
  const prompt = args.prompt
  if (typeof prompt !== 'string' || !lastUserMessage?.trim()) return
  if (VARIATION_INTENT_PATTERN.test(prompt)) return
  if (!VARIATION_INTENT_PATTERN.test(lastUserMessage)) return
  args.prompt = lastUserMessage.trim()
}

/**
 * Fills required `search_online` fields the model often omits (`toolTitle`)
 * and remaps common query aliases so AJV validation does not fail open.
 */
function enrichSearchOnlineArgs(args: Record<string, unknown>): void {
  if (typeof args.query !== 'string' || !args.query.trim()) {
    for (const key of ['q', 'search', 'searchQuery', 'text'] as const) {
      const value = args[key]
      if (typeof value === 'string' && value.trim()) {
        args.query = value.trim()
        break
      }
    }
  }

  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (
    query &&
    (typeof args.toolTitle !== 'string' || !args.toolTitle.trim())
  ) {
    args.toolTitle = query.length > 48 ? `${query.slice(0, 45)}...` : query
  }
}

/**
 * Runs a registered Mothership/copilot server tool handler in-process.
 * Heavy handler registration loads on first call only.
 */
export async function executeMothershipDelegatedTool(
  toolName: MothershipDelegatedToolName,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const serverToolNames = await ensureCopilotToolRuntime()

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

  if (toolName === 'generate_image') {
    enrichGenerateImagePrompt(enrichedArgs, ctx.lastUserMessage)
  }

  if (toolName === 'search_online') {
    enrichSearchOnlineArgs(enrichedArgs)
  }

  // Arena always runs server-registry tools in-process via ServerToolAdapter.
  // Never send go-catalogued tools (e.g. search_online) through shared
  // executeTool — that path treats route:'go' as an app-tool lookup and
  // throws "Built-in tool not found".
  if (serverToolNames.has(toolName)) {
    const result = await executeCopilotServerTool(toolName, enrichedArgs, ctx, workflowId)
    if (!result.success) {
      logger.warn('Copilot server tool failed', { toolName, error: result.error })
    }
    return result
  }

  // Remaining delegated tools are sim-routed (run_workflow, function_execute, …).
  const { executeTool } = await import('@/lib/copilot/tool-executor/executor')
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
    resources: result.resources,
  }
}
