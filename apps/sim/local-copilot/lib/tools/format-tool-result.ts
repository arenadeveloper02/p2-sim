import { truncate } from '@sim/utils/string'
import type { WorkflowState } from '@sim/workflow-types/workflow'
import { getBlock } from '@/blocks/registry'
import { sanitizeForCopilot } from '@/lib/workflows/sanitization/json-sanitizer'

const FUNCTION_EXECUTE_STDOUT_MAX = 12_000

/**
 * Compact JSON for LLM tool results. Falls back to a tiny error payload on failure.
 * Does not truncate — large list/search/KB/table payloads are kept intact.
 */
export function compactStringifyForLlm(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ success: false, error: 'tool result omitted' })
  }
}

const TOOL_EXECUTION_ORDER: Record<string, number> = {
  create_workflow: 0,
  edit_workflow: 1,
  get_workflow_run_options: 2,
  run_workflow: 3,
  run_workflow_until_block: 3,
  run_block: 3,
  run_from_block: 3,
  // Office docs: shell → intent → body. edit_content needs a prior workspace_file intent.
  create_file_folder: 10,
  create_file: 11,
  workspace_file: 12,
  edit_content: 13,
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

export interface MandatoryFollowUp {
  id: string
  hint: string
  resolveWith: string[]
}

/**
 * True when a missing required field label maps to an OAuth credential control
 * (or its advanced manual credential twin) on the given block type.
 */
function isOAuthCredentialField(blockType: string | undefined, fieldLabel: string): boolean {
  if (!blockType || !fieldLabel.trim()) return false
  const blockConfig = getBlock(blockType)
  if (!blockConfig?.subBlocks?.length) {
    // Fallback when registry is unavailable in tests: common OAuth field titles.
    return /\b(account|credential|oauth)\b/i.test(fieldLabel)
  }

  const label = fieldLabel.trim().toLowerCase()
  return blockConfig.subBlocks.some((subBlock) => {
    const title = (subBlock.title ?? '').trim().toLowerCase()
    const id = subBlock.id.trim().toLowerCase()
    if (title !== label && id !== label) return false
    if (subBlock.type === 'oauth-input') return true
    const canonical = subBlock.canonicalParamId?.toLowerCase() ?? ''
    return (
      canonical === 'oauthcredential' ||
      canonical.includes('credential') ||
      id === 'credential' ||
      id === 'manualcredential'
    )
  })
}

/**
 * True when the only remaining workflow lint is missing OAuth credentials the
 * user must connect — edits cannot clear these.
 */
export function isOAuthOnlyEditResult(output: unknown): boolean {
  const record = asRecord(output)
  if (record.success === false) return false

  const skipped = record.skippedItems
  if (Array.isArray(skipped) && skipped.length > 0) return false

  const inputErrors = record.inputValidationErrors
  if (Array.isArray(inputErrors) && inputErrors.length > 0) return false

  const lint = asRecord(record.workflowLint)
  const hasLintObject = Object.keys(lint).length > 0

  if (hasLintObject) {
    const orphanBlocks = Array.isArray(lint.orphanBlocks) ? lint.orphanBlocks : []
    const emptyOutgoingPorts = Array.isArray(lint.emptyOutgoingPorts) ? lint.emptyOutgoingPorts : []
    const invalidBranchPorts = Array.isArray(lint.invalidBranchPorts) ? lint.invalidBranchPorts : []
    const invalidConnectionTargets = Array.isArray(lint.invalidConnectionTargets)
      ? lint.invalidConnectionTargets
      : []
    if (
      orphanBlocks.length > 0 ||
      emptyOutgoingPorts.length > 0 ||
      invalidBranchPorts.length > 0 ||
      invalidConnectionTargets.length > 0
    ) {
      return false
    }

    const unresolved = Array.isArray(lint.unresolvedReferences) ? lint.unresolvedReferences : []
    if (
      unresolved.some((ref) => {
        const kind = asRecord(ref).kind
        return kind !== 'credential'
      })
    ) {
      return false
    }

    const fieldIssues = Array.isArray(lint.fieldIssues) ? lint.fieldIssues : []
    let oauthFieldCount = 0
    for (const issue of fieldIssues) {
      const row = asRecord(issue)
      const inactive = Array.isArray(row.inactiveModeValues) ? row.inactiveModeValues : []
      if (inactive.length > 0) return false

      const missing = Array.isArray(row.missingRequiredFields)
        ? row.missingRequiredFields.filter((value): value is string => typeof value === 'string')
        : []
      if (missing.length === 0) continue

      const blockType = typeof row.blockType === 'string' ? row.blockType : undefined
      for (const field of missing) {
        if (!isOAuthCredentialField(blockType, field)) return false
        oauthFieldCount += 1
      }
    }

    return oauthFieldCount > 0 || unresolved.some((ref) => asRecord(ref).kind === 'credential')
  }

  // Message-only fallback when workflowLint was stripped from the payload.
  const message =
    typeof record.workflowLintMessage === 'string' ? record.workflowLintMessage.trim() : ''
  if (!message) return false
  if (
    /orphan|unconnected|invalid (condition|router|branch)|connections pointing|inactive field mode|tool\/skill references/i.test(
      message
    )
  ) {
    return false
  }
  return (
    /blocks missing required fields/i.test(message) &&
    /\b(account|credential|oauth)\b/i.test(message) &&
    !/\b(query|prompt|model|to|subject|body|url)\b/i.test(
      message.replace(/\b(gmail account|google account|slack account)\b/gi, '')
    )
  )
}

/**
 * Returns true when edit_workflow applied partially and the agent should retry with fixes.
 * OAuth/credential-only lint is excluded — that requires user authorization, not another edit.
 */
export function editWorkflowNeedsFollowUp(output: unknown): boolean {
  const record = asRecord(output)
  if (record.success === false) return true

  const skipped = record.skippedItems
  if (Array.isArray(skipped) && skipped.length > 0) return true

  const inputErrors = record.inputValidationErrors
  if (Array.isArray(inputErrors) && inputErrors.length > 0) return true

  if (typeof record.workflowLintMessage === 'string' && record.workflowLintMessage.trim()) {
    if (isOAuthOnlyEditResult(record)) return false
    return true
  }

  return false
}

function stringifyCapturedValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === 'undefined' || trimmed === 'null') return ''
    return trimmed
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * Extracts user-visible text from code-execution tool payloads (`stdout`, `result`, Daytona output).
 */
export function extractCapturedOutput(result: unknown): string | null {
  const record = asRecord(result)

  if ('stdout' in record || ('result' in record && !('toolId' in record))) {
    const stdout = typeof record.stdout === 'string' ? record.stdout.trim() : ''
    const returnText = stringifyCapturedValue(record.result)
    const captured = stdout || returnText
    return captured || null
  }

  if (typeof record.toolId === 'string') {
    const output = asRecord(record.output)
    if (typeof output.result === 'string' && output.result.trim()) {
      return output.result.trim()
    }
    const nested = extractCapturedOutput(output)
    if (nested) return nested
  }

  if (typeof record.capturedOutput === 'string' && record.capturedOutput.trim()) {
    return record.capturedOutput.trim()
  }

  return null
}

function enrichCodeExecutionResultForLlm(record: Record<string, unknown>): Record<string, unknown> {
  const stdout = typeof record.stdout === 'string' ? record.stdout.trim() : ''
  const returnText = stringifyCapturedValue(record.result)
  const capturedOutput = stdout || returnText

  const formatted: Record<string, unknown> = { ...record }

  if (capturedOutput) {
    if (capturedOutput.length > FUNCTION_EXECUTE_STDOUT_MAX) {
      formatted.capturedOutput = truncate(capturedOutput, FUNCTION_EXECUTE_STDOUT_MAX)
      formatted.capturedOutputTruncated = true
    } else {
      formatted.capturedOutput = capturedOutput
    }
    formatted.readOutputFrom = stdout ? 'stdout' : 'result'
  } else {
    formatted.outputHint =
      'Execution succeeded but both stdout and return value were empty. Use print/console.log or return a value from the script.'
  }

  return formatted
}

function enrichInvokeIntegrationResultForLlm(
  record: Record<string, unknown>
): Record<string, unknown> {
  const output = asRecord(record.output)
  const toolId = typeof record.toolId === 'string' ? record.toolId : ''

  if (toolId.startsWith('daytona_') || 'exitCode' in output) {
    const capturedOutput = (typeof output.result === 'string' && output.result.trim()) || undefined
    return {
      ...record,
      ...(capturedOutput ? { capturedOutput, readOutputFrom: 'result' } : {}),
      ...(!capturedOutput
        ? {
            outputHint:
              'Sandbox execution finished but produced no captured text. Use print/logging in the script.',
          }
        : {}),
    }
  }

  if ('stdout' in output || 'result' in output) {
    return {
      ...record,
      output: enrichCodeExecutionResultForLlm(output),
    }
  }

  return record
}

/**
 * Shapes tool output for the LLM — omits heavy workflowState, keeps repair signals,
 * and compact-serializes without truncating payload content.
 */
export function formatToolResultForLlm(toolName: string, result: unknown): string {
  let formatted: unknown = result

  if (toolName === 'function_execute') {
    formatted = enrichCodeExecutionResultForLlm(asRecord(result))
  } else if (toolName === 'invoke_integration_tool') {
    formatted = enrichInvokeIntegrationResultForLlm(asRecord(result))
  } else if (toolName === 'create_file') {
    const record = asRecord(result)
    const data = asRecord(record.data)
    const size = typeof data.size === 'number' ? data.size : 0
    if (size === 0 && record.success !== false) {
      formatted = {
        ...record,
        needsFollowUpWrite: true,
        followUpHint:
          'File is empty. For markdown/text, call create_file again with `content`, or call workspace_file operation=update on data.vfsPath then edit_content with the full body in the next step.',
      }
    } else {
      formatted = record
    }
  } else if (toolName === 'workspace_file') {
    const record = asRecord(result)
    const data = asRecord(record.data)
    const operation = typeof data.operation === 'string' ? data.operation : ''
    if (
      record.success !== false &&
      (operation === 'append' || operation === 'update' || operation === 'patch')
    ) {
      const fileName =
        (typeof data.name === 'string' && data.name) ||
        (typeof data.vfsPath === 'string' && data.vfsPath) ||
        'the file'
      formatted = {
        ...record,
        needsFollowUpEditContent: true,
        followUpHint:
          typeof record.message === 'string' && record.message.trim()
            ? record.message.trim()
            : `Call edit_content in the next step with the content to write to "${fileName}". Do not call edit_content in parallel with workspace_file.`,
      }
    } else {
      formatted = record
    }
  } else if (toolName === 'edit_workflow' || toolName === 'create_workflow') {
    const record = asRecord(result)
    if (toolName === 'create_workflow' && record.useRunWorkflowInstead) {
      formatted = {
        ...record,
        needsFollowUpRun: true,
        followUpHint:
          typeof record.followUpHint === 'string'
            ? record.followUpHint
            : 'Use get_workflow_run_options then run_workflow on the existing workflow instead of creating a new one.',
      }
    } else {
      const { workflowState, workflowLint: _workflowLint, ...rest } = record
      const next: Record<string, unknown> = { ...rest }

      if (workflowState && typeof workflowState === 'object') {
        const state = workflowState as WorkflowState
        next.copilotSanitizedWorkflowState = sanitizeForCopilot({
          blocks: state.blocks ?? {},
          edges: state.edges ?? [],
          loops: state.loops ?? {},
          parallels: state.parallels ?? {},
        })
      } else if (record.copilotSanitizedWorkflowState) {
        next.copilotSanitizedWorkflowState = record.copilotSanitizedWorkflowState
      }

      if (editWorkflowNeedsFollowUp(record)) {
        next.needsFollowUpEdit = true
        next.followUpHint =
          'Some operations were skipped, inputs rejected, or lint issues remain. Call edit_workflow again with corrected operations before finishing.'
      } else if (isOAuthOnlyEditResult(record)) {
        next.needsOAuthConnect = true
        next.followUpHint =
          'Workflow structure is complete. The only remaining lint is a missing OAuth credential — call oauth_get_auth_link once, share the link, then STOP. Do not re-edit; edits cannot clear credential lint.'
      }

      if (
        toolName === 'create_workflow' &&
        record.success !== false &&
        !record.useRunWorkflowInstead &&
        typeof record.workflowId === 'string' &&
        record.workflowId.trim()
      ) {
        next.needsFollowUpPopulate = true
        next.followUpHint =
          'New workflow created. Call get_blocks_metadata ONCE with every type you need (e.g. { blockIds: ["agent","start_trigger","gmail"] }), then ONE edit_workflow to add blocks and wire Start → downstream via connections on the Start block (startBlockId). Do not re-fetch metadata or validate after a clean edit.'
      }

      formatted = next
    }
  }

  return compactStringifyForLlm(formatted)
}

/**
 * Detects when a tool result requires another tool call before the turn can end.
 */
export function detectMandatoryFollowUp(
  toolName: string,
  llmFormattedJson: string
): MandatoryFollowUp | null {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(llmFormattedJson) as Record<string, unknown>
  } catch {
    return null
  }

  const hint =
    typeof parsed.followUpHint === 'string' && parsed.followUpHint.trim()
      ? parsed.followUpHint.trim()
      : null

  if (parsed.needsFollowUpWrite === true) {
    return {
      id: 'create_file:write',
      hint:
        hint ??
        'File shell is empty. Write content via create_file with content or workspace_file then edit_content.',
      resolveWith: ['edit_content', 'create_file', 'workspace_file'],
    }
  }

  if (parsed.needsFollowUpEditContent === true) {
    return {
      id: 'workspace_file:edit-content',
      hint: hint ?? 'Call edit_content in the next step with the file body.',
      resolveWith: ['edit_content'],
    }
  }

  if (parsed.needsFollowUpEdit === true) {
    return {
      id: `${toolName}:edit-repair`,
      hint:
        hint ??
        'Workflow edits were incomplete. Call edit_workflow again with corrected operations.',
      resolveWith: ['edit_workflow'],
    }
  }

  if (parsed.needsOAuthConnect === true) {
    return {
      id: 'edit_workflow:oauth',
      hint:
        hint ??
        'Missing OAuth credential. Call oauth_get_auth_link once, share the link, then stop.',
      resolveWith: ['oauth_get_auth_link'],
    }
  }

  if (parsed.needsFollowUpPopulate === true) {
    return {
      id: 'create_workflow:populate',
      hint: hint ?? 'New workflow created. Call edit_workflow with add operations to populate it.',
      resolveWith: ['edit_workflow'],
    }
  }

  if (parsed.needsFollowUpRun === true) {
    return {
      id: 'create_workflow:run',
      hint:
        hint ??
        'An existing workflow should be run instead. Call get_workflow_run_options then run_workflow.',
      resolveWith: ['get_workflow_run_options', 'run_workflow'],
    }
  }

  return null
}

/**
 * Removes satisfied follow-ups after a resolving tool succeeds.
 */
export function resolveMandatoryFollowUps(
  pending: MandatoryFollowUp[],
  toolName: string,
  success: boolean,
  result: unknown
): MandatoryFollowUp[] {
  if (!success) return pending

  let next = pending

  if (toolName === 'edit_content') {
    next = next.filter(
      (item) => item.id !== 'create_file:write' && item.id !== 'workspace_file:edit-content'
    )
  }

  if (toolName === 'create_file') {
    const data = asRecord(asRecord(result).data)
    const size = typeof data.size === 'number' ? data.size : 0
    if (size > 0) {
      next = next.filter((item) => item.id !== 'create_file:write')
    }
  }

  if (toolName === 'edit_workflow' && !editWorkflowNeedsFollowUp(result)) {
    next = next.filter(
      (item) => item.id !== 'create_workflow:populate' && !item.id.endsWith(':edit-repair')
    )
  }

  if (toolName === 'oauth_get_auth_link') {
    next = next.filter((item) => item.id !== 'edit_workflow:oauth')
  }

  if (toolName === 'run_workflow') {
    next = next.filter((item) => item.id !== 'create_workflow:run')
  }

  return next
}

/**
 * Nudge message injected when the model stops before mandatory follow-up tools run.
 */
export function buildFollowUpContinuationMessage(followUps: MandatoryFollowUp[]): string {
  const hints = followUps.map((item) => `- ${item.hint}`).join('\n')
  const tools = [...new Set(followUps.flatMap((item) => item.resolveWith))].join(', ')
  return `[System] The user's request is not complete yet. Required follow-up:\n${hints}\n\nCall the needed tools now (${tools}) before responding. Do not end the turn until the task is finished.`
}
