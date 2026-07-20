import { truncate } from '@sim/utils/string'

/**
 * Short fixed fallback only — shown until the cheap engagement model returns a
 * dynamic batch. Prefer AI-driven copy from `generateEngagementStatusMessages`.
 */
export const MODEL_WAIT_STATUS_FALLBACK = [
  'Working on it…',
  'Still working…',
] as const

/** @deprecated Use {@link MODEL_WAIT_STATUS_FALLBACK}; kept for older imports. */
export const MODEL_WAIT_STATUS_MESSAGES = MODEL_WAIT_STATUS_FALLBACK

function fileNameFromArgs(args: Record<string, unknown>): string | undefined {
  for (const key of ['fileName', 'filename', 'name', 'path']) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      const base = value.trim().split('/').pop()
      if (base) return base
    }
  }
  return undefined
}

function humanizeToolName(toolName: string): string {
  return toolName.replace(/[_-]+/g, ' ').trim() || 'tool'
}

export function truncateStatusMessage(message: string, maxLen = 80): string {
  if (message.length <= maxLen) return message
  const suffix = '…'
  return truncate(message, Math.max(0, maxLen - suffix.length), suffix)
}

export function buildToolStartStatus(toolName: string, args: Record<string, unknown>): string {
  const file = fileNameFromArgs(args)
  if (toolName === 'edit_content' || toolName === 'workspace_file') {
    return truncateStatusMessage(file ? `Writing ${file}…` : 'Writing file…')
  }
  if (toolName === 'run_workflow' || toolName === 'run_workflow_until_block') {
    const name =
      typeof args.workflowName === 'string' && args.workflowName.trim()
        ? args.workflowName.trim()
        : undefined
    return truncateStatusMessage(name ? `Running workflow “${name}”…` : 'Running workflow…')
  }
  if (toolName === 'development_generate_app') {
    return truncateStatusMessage('Generating app…')
  }
  if (toolName === 'development_edit_app') {
    return truncateStatusMessage('Editing app…')
  }
  return truncateStatusMessage(`Running ${humanizeToolName(toolName)}…`)
}

export function buildToolHeartbeatStatus(
  lastMessage: string,
  toolName: string,
  args: Record<string, unknown>
): string {
  const file = fileNameFromArgs(args)
  if (file) return truncateStatusMessage(`Still working on ${file}…`)
  if (lastMessage.trim()) {
    return truncateStatusMessage(`${lastMessage.replace(/…$/, '')} — still working…`)
  }
  return truncateStatusMessage(`Still running ${humanizeToolName(toolName)}…`)
}
