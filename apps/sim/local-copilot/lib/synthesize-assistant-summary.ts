import { truncate } from '@sim/utils/string'
import { buildOAuthConnectControl } from '@/local-copilot/lib/oauth-connect-text'
import { extractCapturedOutput } from '@/local-copilot/lib/tools/format-tool-result'

const LEAKED_TOOL_MARKER_PATTERN = /\[Tool [^\]]+\]/g
const GENERIC_MESSAGE_MAX_CHARS = 4_000

export interface ToolTurnRecord {
  name: string
  success: boolean
  result: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

const WORKFLOW_RUN_TOOL_NAMES = new Set([
  'run_workflow',
  'run_block',
  'run_from_block',
  'run_workflow_until_block',
])

const RUN_OUTPUT_MAX_CHARS = 6_000

/**
 * True for tools that execute a workflow (or part of one) and produce run output.
 */
export function isWorkflowRunToolName(name: string): boolean {
  return WORKFLOW_RUN_TOOL_NAMES.has(name)
}

function stringifyRunValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => stringifyRunValue(item))
      .filter((item): item is string => Boolean(item))
    return parts.length > 0 ? parts.join('\n') : null
  }
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  for (const key of ['content', 'summary', 'text', 'message', 'result', 'stdout', 'response']) {
    const nested = record[key]
    if (typeof nested === 'string' && nested.trim()) return nested.trim()
    if (nested && typeof nested === 'object') {
      const deeper = stringifyRunValue(nested)
      if (deeper) return deeper
    }
  }
  return null
}

function extractTextFromBlockOutput(output: unknown): string | null {
  return stringifyRunValue(output)
}

/**
 * Pulls the most useful user-facing text from a workflow execution payload.
 */
export function extractWorkflowRunOutputText(result: unknown): string | null {
  const payload = asRecord(result)
  const logs = Array.isArray(payload.logs) ? payload.logs : []

  let best: { order: number; blockName: string; text: string } | null = null
  for (const entry of logs) {
    const log = asRecord(entry)
    if (log.success === false) continue
    const blockType = typeof log.blockType === 'string' ? log.blockType : ''
    if (blockType === 'start_trigger' || blockType === 'starter') continue
    const text = extractTextFromBlockOutput(log.output)
    if (!text) continue
    const order = typeof log.executionOrder === 'number' ? log.executionOrder : 0
    const blockName =
      (typeof log.blockName === 'string' && log.blockName.trim()) ||
      (blockType ? blockType.replace(/_/g, ' ') : 'Block')
    if (!best || order >= best.order) {
      best = { order, blockName, text }
    }
  }

  if (best) {
    return `**${best.blockName}**\n${truncate(best.text, RUN_OUTPUT_MAX_CHARS)}`
  }

  const fromOutput = extractTextFromBlockOutput(payload.output)
  if (fromOutput) return truncate(fromOutput, RUN_OUTPUT_MAX_CHARS)

  const message = typeof payload.message === 'string' ? payload.message.trim() : ''
  return message ? truncate(message, RUN_OUTPUT_MAX_CHARS) : null
}

function workflowRunLabel(toolName: string): string {
  if (toolName === 'run_block') return 'Block run'
  if (toolName === 'run_from_block') return 'Run-from-block'
  return 'Workflow run'
}

/**
 * Builds chat-ready prose for a single workflow run tool record.
 */
export function formatWorkflowRunChatResult(record: ToolTurnRecord): string {
  const label = workflowRunLabel(record.name)
  const payload = asRecord(record.result)

  if (!record.success || payload.success === false) {
    const error =
      (typeof payload.error === 'string' && payload.error.trim()) ||
      (typeof payload.message === 'string' && payload.message.trim()) ||
      null
    return error ? `${label} failed: ${error}` : `${label} failed.`
  }

  const status =
    (typeof payload.status === 'string' && payload.status.trim()) ||
    (typeof payload.success === 'boolean' ? (payload.success ? 'completed' : 'failed') : 'completed')
  const header = `${label} ${status}.`
  const body = extractWorkflowRunOutputText(record.result)
  return body ? `${header}\n\n${body}` : header
}

/**
 * Latest workflow-run tool result formatted for the chat window.
 */
export function buildWorkflowRunChatAppendix(records: ToolTurnRecord[]): string | null {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index]
    if (!record || !isWorkflowRunToolName(record.name)) continue
    return formatWorkflowRunChatResult(record)
  }
  return null
}

/**
 * True when a run finished and the UI never got post-run assistant prose —
 * typical stuck state after "Let me run it." + Running workflow.
 */
export function shouldAppendWorkflowRunChatResult(options: {
  streamedUserFacingText: string
  streamedCharsAtLastRunTool: number | null
  toolRecords: ToolTurnRecord[]
}): boolean {
  if (options.streamedCharsAtLastRunTool === null) return false
  if (!buildWorkflowRunChatAppendix(options.toolRecords)) return false
  return options.streamedUserFacingText.length <= options.streamedCharsAtLastRunTool
}

/**
 * Removes legacy `[Tool name: state]` markers that must not appear in user-facing text.
 *
 * @param options.trim When `false`, preserves leading/trailing whitespace — required
 *   for streaming deltas where spaces live on chunk boundaries. Defaults to `true`.
 */
export function stripLeakedToolMarkers(text: string, options?: { trim?: boolean }): string {
  const stripped = text.replace(LEAKED_TOOL_MARKER_PATTERN, '').replace(/\n{3,}/g, '\n\n')
  return options?.trim === false ? stripped : stripped.trim()
}

/**
 * Builds a concise assistant reply when the model finishes tool use without prose.
 */
export function synthesizeAssistantSummaryFromTools(records: ToolTurnRecord[]): string | null {
  const parts: string[] = []

  for (const record of records) {
    if (!record.success) {
      const payload = asRecord(record.result)
      const error =
        (typeof payload.error === 'string' && payload.error) ||
        (typeof payload.message === 'string' && payload.message) ||
        null
      parts.push(
        error
          ? `I couldn't complete that step: ${error}`
          : `I couldn't complete ${record.name.replace(/_/g, ' ')}.`
      )
      continue
    }

    if (record.name === 'create_workflow') {
      const payload = asRecord(record.result)
      const name =
        (typeof payload.workflowName === 'string' && payload.workflowName.trim()) ||
        (typeof payload.name === 'string' && payload.name.trim()) ||
        null
      parts.push(
        name
          ? `Created the workflow "${name}" and opened it in the panel.`
          : 'Created a new workflow and opened it in the panel.'
      )
      continue
    }

    if (record.name === 'edit_workflow') {
      const payload = asRecord(record.result)
      const message = typeof payload.message === 'string' ? payload.message.trim() : ''
      if (!record.success) {
        parts.push(message || 'Could not update the workflow. Check the edit errors and retry.')
      } else if (payload.partialApply === true || payload.needsFollowUpEdit === true) {
        parts.push(
          message || 'Updated the workflow partially — some changes still need a follow-up edit.'
        )
      } else if (message) {
        parts.push(truncate(message, GENERIC_MESSAGE_MAX_CHARS))
      } else {
        parts.push('Updated the workflow with the requested blocks and connections.')
      }
      continue
    }

    if (record.name === 'oauth_get_auth_link') {
      const control = buildOAuthConnectControl(record.result)
      if (control) {
        parts.push(`Connect ${control.provider} to finish setup.`)
      } else {
        const payload = asRecord(record.result)
        const message = typeof payload.message === 'string' ? payload.message.trim() : ''
        if (message) parts.push(message)
      }
      continue
    }

    if (record.name === 'generate_image') {
      const payload = asRecord(record.result)
      const message = typeof payload.message === 'string' ? payload.message.trim() : ''
      if (message) {
        parts.push(message)
        continue
      }

      const files = Array.isArray(payload.files) ? payload.files : []
      if (files.length > 1) {
        const paths = files
          .map((file) => asRecord(file).vfsPath ?? asRecord(file).fileName)
          .filter((path): path is string => typeof path === 'string' && path.length > 0)
        parts.push(
          paths.length
            ? `Generated ${files.length} images: ${paths.map((path) => `"${path}"`).join(', ')}.`
            : `Generated ${files.length} image variations.`
        )
        continue
      }

      const vfsPath =
        (typeof payload.vfsPath === 'string' && payload.vfsPath) ||
        (typeof payload.fileName === 'string' && payload.fileName) ||
        null
      if (vfsPath) {
        parts.push(`Image saved to "${vfsPath}".`)
      }
      continue
    }

    if (record.name === 'open_resource') {
      continue
    }

    if (record.name === 'search_online') {
      const payload = asRecord(record.result)
      const summary = typeof payload.summary === 'string' ? payload.summary.trim() : ''
      if (summary) parts.push(summary)
      continue
    }

    if (isWorkflowRunToolName(record.name)) {
      parts.push(formatWorkflowRunChatResult(record))
      continue
    }

    if (record.name === 'function_execute' || record.name === 'invoke_integration_tool') {
      const captured = extractCapturedOutput(record.result)
      if (captured) {
        parts.push(truncate(captured, GENERIC_MESSAGE_MAX_CHARS))
      }
      continue
    }

    // Specialist domains (`workflow`, `run`, …) and other tools often finish with
    // only a `message` / findings payload. Without this, mothership can settle with
    // zero renderable prose (specialist tool names are absorbed as empty groups).
    const payload = asRecord(record.result)
    const message = typeof payload.message === 'string' ? payload.message.trim() : ''
    if (message) {
      // Prefer a short human summary over raw `[tool] {json…}` specialist dumps.
      const cleaned = summarizeSpecialistFindings(record.name, message)
      parts.push(truncate(cleaned, GENERIC_MESSAGE_MAX_CHARS))
      continue
    }

    if (isLikelySpecialistDomain(record.name)) {
      parts.push(`Finished the ${record.name.replace(/_/g, ' ')} steps for your request.`)
    }
  }

  const summary = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n')
  return summary || null
}

const SPECIALIST_DOMAIN_NAMES = new Set([
  'workflow',
  'run',
  'deploy',
  'auth',
  'knowledge',
  'table',
  'scheduled_task',
  'agent',
  'research',
  'media',
  'file',
  'superagent',
])

function isLikelySpecialistDomain(name: string): boolean {
  return SPECIALIST_DOMAIN_NAMES.has(name)
}

/**
 * Turns specialist findings like `[create_workflow] {"workflowName":"…"}` into short prose.
 */
function summarizeSpecialistFindings(domain: string, message: string): string {
  const created = message.match(/\[create_workflow\][^\n]*/i)
  if (created) {
    const nameMatch =
      created[0].match(/"workflowName"\s*:\s*"([^"]+)"/) ||
      created[0].match(/"name"\s*:\s*"([^"]+)"/)
    if (nameMatch?.[1]) {
      return `Created the workflow "${nameMatch[1]}" and set it up for your request.`
    }
    return 'Created a new workflow and set it up for your request.'
  }

  if (/\[edit_workflow\]/i.test(message)) {
    return 'Updated the workflow with the requested blocks and connections.'
  }

  // Drop dense JSON tool dumps; keep any free-form specialist prose.
  const withoutToolJson = message
    .replace(/\[[a-z0-9_]+\]\s*\{[\s\S]*?}(?=\n\n|\n\[|$)/gi, '')
    .trim()
  if (withoutToolJson.length >= 20) return withoutToolJson

  if (isLikelySpecialistDomain(domain)) {
    return `Finished the ${domain.replace(/_/g, ' ')} steps for your request.`
  }

  return message
}
