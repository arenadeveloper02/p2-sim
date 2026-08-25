/**
 * Optional edit_workflow dry-run helpers.
 */

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
