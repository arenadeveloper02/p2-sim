import { truncate } from '@sim/utils/string'
import { formatOAuthConnectCredentialTag } from '@/local-copilot/lib/oauth-connect-text'
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
          message ||
            'Updated the workflow partially — some changes still need a follow-up edit.'
        )
      } else if (message) {
        parts.push(truncate(message, GENERIC_MESSAGE_MAX_CHARS))
      } else {
        parts.push('Updated the workflow with the requested blocks and connections.')
      }
      continue
    }

    if (record.name === 'oauth_get_auth_link') {
      const connectText = formatOAuthConnectCredentialTag(record.result)
      if (connectText) {
        parts.push(connectText)
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

    if (
      record.name === 'run_workflow' ||
      record.name === 'run_block' ||
      record.name === 'run_from_block' ||
      record.name === 'run_workflow_until_block'
    ) {
      const payload = asRecord(record.result)
      const status = typeof payload.status === 'string' ? payload.status : 'completed'
      const label =
        record.name === 'run_block'
          ? 'Block run'
          : record.name === 'run_from_block'
            ? 'Run-from-block'
            : 'Workflow run'
      parts.push(`${label} ${status}.`)
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
