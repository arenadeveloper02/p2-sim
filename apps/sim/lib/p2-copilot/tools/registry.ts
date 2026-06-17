import { createLogger } from '@sim/logger'
import { TOOL_CATALOG } from '@/lib/copilot/generated/tool-catalog-v1'
import { ensureHandlersRegistered } from '@/lib/copilot/tool-executor/register-handlers'
import { executeTool } from '@/lib/copilot/tool-executor/executor'
import type { ToolExecutionContext, ToolExecutionResult } from '@/lib/copilot/tool-executor/types'
import { describeTool } from '@/lib/p2-copilot/tools/descriptions'
import { NATIVE_TOOLS } from '@/lib/p2-copilot/tools/native'

const logger = createLogger('P2CopilotToolRegistry')

export interface P2ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
  requiresConfirmation: boolean
}

const EMPTY_SCHEMA: Record<string, unknown> = { type: 'object', properties: {} }

/**
 * Builds the schema list advertised to the brain.
 *
 * The set is: every native read tool (read_workflow, get_blocks_metadata) plus
 * every catalog tool that Sim can execute locally (route === 'sim'). That gives
 * the agent read AND write access across all blocks, tools, deployment, and
 * integrations — the full "copilot of copilot" surface.
 */
export function getToolSchemas(): P2ToolSchema[] {
  const schemas: P2ToolSchema[] = []

  for (const tool of Object.values(NATIVE_TOOLS)) {
    schemas.push({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      requiresConfirmation: tool.requiresConfirmation ?? false,
    })
  }

  for (const entry of Object.values(TOOL_CATALOG)) {
    if (entry.route !== 'sim') continue
    if (entry.hidden) continue
    if (NATIVE_TOOLS[entry.id]) continue

    schemas.push({
      name: entry.id,
      description: describeTool(entry.id),
      parameters: (entry.parameters as Record<string, unknown>) ?? EMPTY_SCHEMA,
      requiresConfirmation: entry.requiresConfirmation ?? false,
    })
  }

  return schemas
}

/** Tool names that mutate state and should be gated behind confirmation later. */
export function isWriteTool(name: string): boolean {
  const entry = TOOL_CATALOG[name]
  return entry?.requiredPermission === 'write' || entry?.requiredPermission === 'admin'
}

/**
 * Executes a tool requested by the brain.
 *
 * Native tools run inline; everything else is delegated to Sim's shared
 * tool-executor so auth, permissions, and persistence behave exactly like the
 * existing copilot.
 */
export async function executeP2Tool(
  name: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const native = NATIVE_TOOLS[name]
  if (native) {
    return native.execute(args, context)
  }

  const entry = TOOL_CATALOG[name]
  if (!entry || entry.route !== 'sim') {
    return { success: false, error: `Tool not available to P2 copilot: ${name}` }
  }

  ensureHandlersRegistered()

  logger.info('Executing Sim tool for P2 copilot', { tool: name })
  return executeTool(name, args, context)
}
