/** Resolved lineage stamped on workflow_execution_logs and usage_log rows. */
export interface ExecutionLineage {
  parentExecutionId?: string
  rootExecutionId: string
  triggeringChatId?: string
  triggeringRunId?: string
}

/** Wire/body fields accepted before auth sanitization and root resolution. */
export interface ExecutionLineageInput {
  parentExecutionId?: string
  parentRootExecutionId?: string
  triggeringChatId?: string
  triggeringRunId?: string
}

export type ExecutionLineageAuthMode = 'internal' | 'copilot_client' | 'external'

/**
 * Classifies how much lineage a caller may supply on workflow execute.
 * Parent/root ids are trusted only on internal server-to-server calls.
 */
export function resolveExecutionLineageAuthMode(params: {
  authType?: string
  isClientSession?: boolean
  triggerType?: string
}): ExecutionLineageAuthMode {
  if (params.authType === 'internal_jwt') {
    return 'internal'
  }
  if (params.isClientSession && params.triggerType === 'copilot') {
    return 'copilot_client'
  }
  return 'external'
}

/** Strips lineage fields callers are not allowed to assert. */
export function sanitizeExecutionLineageInput(
  input: ExecutionLineageInput | undefined,
  mode: ExecutionLineageAuthMode
): ExecutionLineageInput | undefined {
  if (!input) return undefined

  if (mode === 'internal') {
    return input
  }

  if (mode === 'copilot_client') {
    const sanitized: ExecutionLineageInput = {}
    if (input.triggeringChatId) sanitized.triggeringChatId = input.triggeringChatId
    if (input.triggeringRunId) sanitized.triggeringRunId = input.triggeringRunId
    return Object.keys(sanitized).length > 0 ? sanitized : undefined
  }

  return undefined
}

/**
 * Computes child lineage: root follows the parent's root, else the parent id, else self.
 */
export function resolveExecutionLineage(params: {
  executionId: string
  parentExecutionId?: string
  parentRootExecutionId?: string
  triggeringChatId?: string
  triggeringRunId?: string
}): ExecutionLineage {
  const {
    executionId,
    parentExecutionId,
    parentRootExecutionId,
    triggeringChatId,
    triggeringRunId,
  } = params

  if (!parentExecutionId) {
    return {
      rootExecutionId: executionId,
      ...(triggeringChatId ? { triggeringChatId } : {}),
      ...(triggeringRunId ? { triggeringRunId } : {}),
    }
  }

  return {
    parentExecutionId,
    rootExecutionId: parentRootExecutionId ?? parentExecutionId,
    ...(triggeringChatId ? { triggeringChatId } : {}),
    ...(triggeringRunId ? { triggeringRunId } : {}),
  }
}

/** Loads the parent's root execution id when only parentExecutionId is known. */
export async function lookupParentRootExecutionId(
  parentExecutionId: string
): Promise<string | undefined> {
  const { db } = await import('@sim/db')
  const { workflowExecutionLogs } = await import('@sim/db/schema')
  const { eq } = await import('drizzle-orm')

  const [row] = await db
    .select({ rootExecutionId: workflowExecutionLogs.rootExecutionId })
    .from(workflowExecutionLogs)
    .where(eq(workflowExecutionLogs.executionId, parentExecutionId))
    .limit(1)

  return row?.rootExecutionId ?? undefined
}

/**
 * Resolves lineage for a new child execution, optionally loading the parent's root from DB.
 */
export async function resolveChildExecutionLineage(params: {
  executionId: string
  input?: ExecutionLineageInput
  loadParentRoot?: boolean
}): Promise<ExecutionLineage> {
  const { executionId, input, loadParentRoot = true } = params
  const parentExecutionId = input?.parentExecutionId

  let parentRootExecutionId = input?.parentRootExecutionId
  if (parentExecutionId && !parentRootExecutionId && loadParentRoot) {
    parentRootExecutionId = await lookupParentRootExecutionId(parentExecutionId)
  }

  return resolveExecutionLineage({
    executionId,
    parentExecutionId,
    parentRootExecutionId,
    triggeringChatId: input?.triggeringChatId,
    triggeringRunId: input?.triggeringRunId,
  })
}
