/**
 * Optional edit_workflow dry-run helpers.
 */

export const HIGH_IMPACT_EDIT_OP_THRESHOLD = 5

const DESTRUCTIVE_EDIT_OPERATIONS = new Set([
  'delete',
  'delete_block',
  'remove',
  'remove_block',
  'delete_edge',
  'remove_edge',
])

const ADDITIVE_EDIT_OPERATIONS = new Set(['add', 'add_block', 'create', 'create_block'])

function operationName(op: unknown): string {
  if (!op || typeof op !== 'object' || Array.isArray(op)) return ''
  const record = op as Record<string, unknown>
  for (const key of ['operation_type', 'operationType', 'operation', 'op', 'type', 'action']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase()
  }
  return ''
}

/**
 * Returns true when an edit_workflow ops list is high-impact.
 */
export function isHighImpactEdit(operations: unknown[]): boolean {
  const operationNames = operations.map(operationName)
  if (operationNames.some((name) => DESTRUCTIVE_EDIT_OPERATIONS.has(name))) return true

  const existingResourceEdits = operationNames.filter((name) => !ADDITIVE_EDIT_OPERATIONS.has(name))
  return existingResourceEdits.length >= HIGH_IMPACT_EDIT_OP_THRESHOLD
}

/**
 * Whether the executor should return a dry-run preview instead of mutating.
 * Only when the caller explicitly requested a preview — user-requested
 * replacements (including deleting a block) apply immediately.
 */
export function shouldPreviewEditWorkflow(args: Record<string, unknown>): boolean {
  return args.dryRun === true
}

/**
 * Builds a dry-run preview payload for the model / UI.
 */
export function buildEditWorkflowDryRunResult(params: {
  operations: unknown[]
  workflowId: string
}): Record<string, unknown> {
  const { operations, workflowId } = params
  return {
    success: true,
    dryRun: true,
    workflowId,
    operationCount: operations.length,
    operations,
    message: 'Dry-run preview only — no workflow changes were applied.',
  }
}
