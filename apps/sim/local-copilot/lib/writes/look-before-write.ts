const BOOTSTRAP_BLOCK_TYPES = new Set(['start_trigger', 'starter', 'start'])

export interface LookBeforeWriteOk {
  ok: true
}

export interface LookBeforeWriteDenied {
  ok: false
  error: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function operationType(operation: Record<string, unknown>): string {
  const raw = operation.operation_type ?? operation.operationType ?? operation.type
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}

function blockTypeFromOperation(operation: Record<string, unknown>): string | undefined {
  const params = asRecord(operation.params)
  for (const key of ['type', 'blockType', 'block_type']) {
    const value = params[key] ?? operation[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

/**
 * Requires get_blocks_metadata for block types being added (except bootstrap types).
 */
export function assertEditWorkflowLookBeforeWrite(params: {
  operations: unknown
  blocksMetadataByType?: Map<string, unknown>
}): LookBeforeWriteOk | LookBeforeWriteDenied {
  if (!Array.isArray(params.operations)) return { ok: true }
  const missing = new Set<string>()
  for (const item of params.operations) {
    const operation = asRecord(item)
    if (operationType(operation) !== 'add') continue
    const blockType = blockTypeFromOperation(operation)
    if (!blockType || BOOTSTRAP_BLOCK_TYPES.has(blockType)) continue
    if (!params.blocksMetadataByType?.has(blockType.toLowerCase())) missing.add(blockType)
  }
  if (missing.size === 0) return { ok: true }
  return {
    ok: false,
    error: `Call get_blocks_metadata for [${[...missing].join(', ')}] before edit_workflow.`,
  }
}

/**
 * Requires invoke targets to be known or listed this turn.
 */
export function assertInvokeLookBeforeWrite(params: {
  toolId: string
  listedIntegrationToolIds?: Set<string>
  knownToolIds?: Set<string>
}): LookBeforeWriteOk | LookBeforeWriteDenied {
  const toolId = params.toolId.trim()
  if (!toolId) {
    return { ok: false, error: 'toolId is required — call list_integration_tools first' }
  }
  if (params.knownToolIds?.has(toolId) || params.listedIntegrationToolIds?.has(toolId)) {
    return { ok: true }
  }
  return {
    ok: false,
    error: `Call list_integration_tools before invoke_integration_tool for "${toolId}".`,
  }
}
