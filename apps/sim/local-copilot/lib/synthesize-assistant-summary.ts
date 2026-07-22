import { truncate } from '@sim/utils/string'
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
export function stripLeakedToolMarkers(
  text: string,
  options?: { trim?: boolean }
): string {
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

    // Specialists and other tools often finish with only a `message` payload.
    // Without this, the mothership UI can settle with zero renderable prose
    // (specialist tool names are absorbed as empty subagent groups).
    const payload = asRecord(record.result)
    const message = typeof payload.message === 'string' ? payload.message.trim() : ''
    if (message) {
      parts.push(truncate(message, GENERIC_MESSAGE_MAX_CHARS))
    }
  }

  const summary = parts.map((part) => part.trim()).filter(Boolean).join('\n\n')
  return summary || null
}
