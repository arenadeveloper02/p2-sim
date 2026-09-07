/**
 * Turn-scoped create reuse. Stored as a nested object on tool context so
 * `{ ...toolCtx }` copies still share the same mutation record.
 */
export interface CreatedWorkflowThisTurn {
  workflowId: string
  startBlockId?: string
  workflowName?: string
}

export interface LocalCopilotTurnMutations {
  createdWorkflow?: CreatedWorkflowThisTurn
  createdFiles: Map<string, unknown>
  createWorkflowInFlight?: Promise<unknown>
}

export function createTurnMutations(): LocalCopilotTurnMutations {
  return { createdFiles: new Map() }
}

export function rememberCreatedWorkflow(
  state: LocalCopilotTurnMutations,
  created: CreatedWorkflowThisTurn
): void {
  state.createdWorkflow = created
}

export function reuseCreatedWorkflow(
  state: LocalCopilotTurnMutations | undefined
): CreatedWorkflowThisTurn | undefined {
  return state?.createdWorkflow
}

function canonicalFilePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  const withPrefix = trimmed.startsWith('files/') ? trimmed : `files/${trimmed}`
  return withPrefix.toLowerCase()
}

export function rememberCreatedFile(
  state: LocalCopilotTurnMutations,
  path: string,
  result: unknown
): void {
  const key = canonicalFilePath(path)
  if (!key) return
  state.createdFiles.set(key, result)
}

export function reuseCreatedFile<T = unknown>(
  state: LocalCopilotTurnMutations | undefined,
  path: string
): T | undefined {
  const key = canonicalFilePath(path)
  if (!key) return undefined
  return state?.createdFiles.get(key) as T | undefined
}
