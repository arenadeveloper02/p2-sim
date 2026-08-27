import { truncate } from '@sim/utils/string'
import type { WorkflowState } from '@sim/workflow-types/workflow'
import { documentLayoutFollowUpHint } from '@/lib/copilot/chat/document-format-guidance'
import { REDACTED_MARKER } from '@/lib/core/security/redaction'
import { sanitizeForCopilot } from '@/lib/workflows/sanitization/json-sanitizer'
import { getBlock } from '@/blocks/registry'
import type { ArtifactStore } from '@/local-copilot/lib/context/artifacts'
import {
  LOAD_COPILOT_ARTIFACT_TOOL_NAME,
  maybeOffloadToolResult,
} from '@/local-copilot/lib/context/artifacts'
import { sanitizeForLlm } from '@/local-copilot/lib/security/sanitize'

const FUNCTION_EXECUTE_STDOUT_MAX = 12_000

/** Default hard cap for LLM-bound tool result JSON (history + live path). */
export const LOCAL_COPILOT_TOOL_RESULT_MAX_CHARS = 8_000

/**
 * Slightly higher cap so {@link FUNCTION_EXECUTE_STDOUT_MAX} stdout can still fit
 * inside the JSON envelope without a second hard cut.
 */
export const LOCAL_COPILOT_TOOL_RESULT_MAX_CHARS_FUNCTION_EXECUTE = 13_000

const TOOL_RESULT_TRUNCATION_MARKER =
  '\n…[truncated: tool result exceeded char budget; re-query with a narrower call or load_copilot_artifact if an artifactId is present]'

/**
 * Compact JSON for LLM tool results. Falls back to a tiny error payload on failure.
 * Applies a hard char cap so history reload (no artifact store) cannot rehydrate
 * multi-10k tool bodies.
 */
export function compactStringifyForLlm(
  value: unknown,
  maxChars: number = LOCAL_COPILOT_TOOL_RESULT_MAX_CHARS
): string {
  try {
    const serialized = JSON.stringify(value)
    if (serialized.length <= maxChars) return serialized
    const budget = Math.max(0, maxChars - TOOL_RESULT_TRUNCATION_MARKER.length)
    return `${serialized.slice(0, budget)}${TOOL_RESULT_TRUNCATION_MARKER}`
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
  create_file_folder: 10,
  create_file: 11,
  workspace_file: 12,
  edit_content: 13,
}

const FILE_PIPELINE_TOOLS = [
  'create_file_folder',
  'create_file',
  'workspace_file',
  'edit_content',
] as const
const FILE_PIPELINE_TOOL_SET = new Set<string>(FILE_PIPELINE_TOOLS)
const WORKFLOW_TOOLS_BEFORE_FILES = 10

function interleaveFilePipelines<T extends { name: string }>(fileCalls: T[]): T[] {
  const queues = new Map<string, T[]>()
  for (const name of FILE_PIPELINE_TOOLS) {
    queues.set(name, [])
  }
  for (const call of fileCalls) {
    queues.get(call.name)?.push(call)
  }

  const ordered: T[] = []
  const hasRemaining = () => FILE_PIPELINE_TOOLS.some((name) => (queues.get(name)?.length ?? 0) > 0)
  while (hasRemaining()) {
    for (const name of FILE_PIPELINE_TOOLS) {
      const next = queues.get(name)?.shift()
      if (next) ordered.push(next)
    }
  }
  return ordered
}

/**
 * Orders a tool batch so workflow mutations stay first, then each office file
 * runs as create → workspace_file → edit_content. A plain numeric sort would
 * run every workspace_file before any edit_content, and the later intent would
 * steal the first file's body (empty DOCX preview).
 */
export function sortToolCallsForExecution<T extends { name: string }>(calls: T[]): T[] {
  const early: T[] = []
  const fileCalls: T[] = []
  const late: T[] = []

  for (const call of calls) {
    if (FILE_PIPELINE_TOOL_SET.has(call.name)) {
      fileCalls.push(call)
      continue
    }
    const order = TOOL_EXECUTION_ORDER[call.name]
    if (order !== undefined && order < WORKFLOW_TOOLS_BEFORE_FILES) {
      early.push(call)
    } else {
      late.push(call)
    }
  }

  early.sort((a, b) => (TOOL_EXECUTION_ORDER[a.name] ?? 0) - (TOOL_EXECUTION_ORDER[b.name] ?? 0))
  late.sort((a, b) => (TOOL_EXECUTION_ORDER[a.name] ?? 99) - (TOOL_EXECUTION_ORDER[b.name] ?? 99))
  return [...early, ...interleaveFilePipelines(fileCalls), ...late]
}

/**
 * Binds `workspace_file` → `edit_content` Redis intents to one channel.
 * When a File Agent pass already seeded `previousChannelId` (the specialist
 * tool-call id), keep it so preview, span, and consume all share that id.
 * Otherwise fall back to this `workspace_file` call id (parent-lane writes).
 */
export function bindLocalFileIntentChannel(
  toolName: string,
  toolCallId: string,
  previousChannelId: string | undefined
): string | undefined {
  if (toolName === 'workspace_file') return previousChannelId ?? toolCallId
  return previousChannelId
}

/** Drop the channel after `edit_content` so the next file starts a new intent. */
export function clearLocalFileIntentChannel(
  toolName: string,
  channelId: string | undefined
): string | undefined {
  return toolName === 'edit_content' ? undefined : channelId
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

  if (record.partialApply === true) return true

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
 * and compact-serializes. Oversized payloads are offloaded when an artifact store is provided.
 */
export function formatToolResultForLlm(
  toolName: string,
  result: unknown,
  options?: { artifactStore?: ArtifactStore }
): string {
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
      const filePath =
        (typeof data.vfsPath === 'string' && data.vfsPath) ||
        (typeof data.name === 'string' && data.name) ||
        ''
      const isOfficeShell = /\.(pptx|docx|pdf)$/i.test(filePath)
      if (isOfficeShell) {
        // edit_content alone fails without a prior workspace_file intent — force that step.
        formatted = {
          ...record,
          needsFollowUpWorkspaceFile: true,
          followUpHint:
            'Office file shell is empty. Do not create another file. Call workspace_file operation=update with target.kind=path and data.vfsPath (plus title), then edit_content in a later round.',
        }
      } else {
        formatted = {
          ...record,
          needsFollowUpWrite: true,
          followUpHint:
            'File is empty. Do not create another file. Call workspace_file operation=update with target.kind=path and data.vfsPath, then edit_content with the full body.',
        }
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
      const baseHint =
        typeof record.message === 'string' && record.message.trim()
          ? record.message.trim()
          : `Call edit_content in the next step with the content to write to "${fileName}". Do not call edit_content in parallel with workspace_file.`
      formatted = {
        ...record,
        needsFollowUpEditContent: true,
        followUpHint: documentLayoutFollowUpHint(fileName, baseHint),
      }
    } else {
      formatted = record
    }
  } else if (toolName === 'edit_workflow' || toolName === 'create_workflow') {
    const record = asRecord(result)
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
      typeof record.workflowId === 'string' &&
      record.workflowId.trim()
    ) {
      next.needsFollowUpPopulate = true
      next.followUpHint =
        'New workflow created. Do NOT create_workflow or get_workflow_context again. Call get_blocks_metadata once with every type you will add (e.g. { blockIds: ["agent","human_in_the_loop"] }), then edit_workflow using startBlockId. Up to 5 sequential edit_workflow calls are OK. Human review uses type human_in_the_loop.'
    }

    formatted = next
  }

  if (toolName === 'generate_api_key') {
    const record = asRecord(formatted)
    if (typeof record.key === 'string') {
      formatted = {
        ...record,
        key: REDACTED_MARKER,
        redacted: true,
      }
    }
  }

  const sanitized = sanitizeForLlm(formatted)
  if (options?.artifactStore && toolName !== LOAD_COPILOT_ARTIFACT_TOOL_NAME) {
    const offload = maybeOffloadToolResult(toolName, sanitized, options.artifactStore)
    if (offload.offloaded) {
      return compactStringifyForLlm(offload.stub)
    }
  }

  const maxChars =
    toolName === 'function_execute'
      ? LOCAL_COPILOT_TOOL_RESULT_MAX_CHARS_FUNCTION_EXECUTE
      : LOCAL_COPILOT_TOOL_RESULT_MAX_CHARS
  return compactStringifyForLlm(sanitized, maxChars)
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
      resolveWith: ['workspace_file', 'edit_content'],
    }
  }

  if (parsed.needsFollowUpWorkspaceFile === true) {
    return {
      id: 'create_file:workspace-file',
      hint:
        hint ??
        'Office file shell is empty. Call workspace_file operation=update on the file path, then edit_content in a later round.',
      resolveWith: ['workspace_file'],
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

  if (toolName === 'workspace_file') {
    next = next.filter((item) => item.id !== 'create_file:workspace-file')
  }

  if (toolName === 'create_file') {
    const data = asRecord(asRecord(result).data)
    const size = typeof data.size === 'number' ? data.size : 0
    if (size > 0) {
      next = next.filter(
        (item) => item.id !== 'create_file:write' && item.id !== 'create_file:workspace-file'
      )
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
