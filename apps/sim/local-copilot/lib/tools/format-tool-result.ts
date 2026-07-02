import { sanitizeForCopilot } from '@/lib/workflows/sanitization/json-sanitizer'
import { truncate } from '@sim/utils/string'
import type { WorkflowState } from '@sim/workflow-types/workflow'

const FUNCTION_EXECUTE_STDOUT_MAX = 12_000

const TOOL_EXECUTION_ORDER: Record<string, number> = {
  create_workflow: 0,
  edit_workflow: 1,
  get_workflow_run_options: 2,
  run_workflow: 3,
  run_workflow_until_block: 3,
}

/**
 * Ensures create_workflow runs before edit_workflow when both appear in one assistant turn.
 */
export function sortToolCallsForExecution<T extends { name: string }>(calls: T[]): T[] {
  return [...calls].sort(
    (a, b) => (TOOL_EXECUTION_ORDER[a.name] ?? 99) - (TOOL_EXECUTION_ORDER[b.name] ?? 99)
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/**
 * Returns true when edit_workflow applied partially and the agent should retry with fixes.
 */
export function editWorkflowNeedsFollowUp(output: unknown): boolean {
  const record = asRecord(output)
  if (record.success === false) return true

  const skipped = record.skippedItems
  if (Array.isArray(skipped) && skipped.length > 0) return true

  const inputErrors = record.inputValidationErrors
  if (Array.isArray(inputErrors) && inputErrors.length > 0) return true

  if (typeof record.workflowLintMessage === 'string' && record.workflowLintMessage.trim()) {
    return true
  }

  return false
}

/**
 * Shapes tool output for the LLM — omits heavy workflowState, keeps repair signals.
 */
export function formatToolResultForLlm(toolName: string, result: unknown): string {
  if (toolName === 'function_execute') {
    const record = asRecord(result)
    const stdout = record.stdout
    if (typeof stdout === 'string' && stdout.length > FUNCTION_EXECUTE_STDOUT_MAX) {
      return JSON.stringify({
        ...record,
        stdout: truncate(stdout, FUNCTION_EXECUTE_STDOUT_MAX),
        stdoutTruncated: true,
      })
    }
    return JSON.stringify(result)
  }

  if (toolName !== 'edit_workflow' && toolName !== 'create_workflow') {
    return JSON.stringify(result)
  }

  const record = asRecord(result)
  if (toolName === 'create_workflow' && record.useRunWorkflowInstead) {
    return JSON.stringify({
      ...record,
      needsFollowUpRun: true,
      followUpHint:
        typeof record.followUpHint === 'string'
          ? record.followUpHint
          : 'Use get_workflow_run_options then run_workflow on the existing workflow instead of creating a new one.',
    })
  }

  const { workflowState, workflowLint: _workflowLint, ...rest } = record

  const formatted: Record<string, unknown> = { ...rest }

  if (workflowState && typeof workflowState === 'object') {
    const state = workflowState as WorkflowState
    formatted.copilotSanitizedWorkflowState = sanitizeForCopilot({
      blocks: state.blocks ?? {},
      edges: state.edges ?? [],
      loops: state.loops ?? {},
      parallels: state.parallels ?? {},
    })
  } else if (record.copilotSanitizedWorkflowState) {
    formatted.copilotSanitizedWorkflowState = record.copilotSanitizedWorkflowState
  }

  if (editWorkflowNeedsFollowUp(record)) {
    formatted.needsFollowUpEdit = true
    formatted.followUpHint =
      'Some operations were skipped, inputs rejected, or lint issues remain. Call edit_workflow again with corrected operations before finishing.'
  }

  return JSON.stringify(formatted)
}
