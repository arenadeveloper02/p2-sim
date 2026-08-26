import { isPlainRecord, omit, toRecord } from '@sim/utils/object'
import { extractResourcesFromToolResult } from '@/lib/copilot/resources/extraction'
import type { MothershipResource } from '@/lib/copilot/resources/types'

const FILE_BODY_TOOL_NAMES = new Set(['create_file', 'edit_content'])

function omitFileBodyContent(params: Record<string, unknown>): Record<string, unknown> {
  if (typeof params.content !== 'string') return params
  return {
    ...omit(params, ['content']),
    contentOmitted: true,
    contentChars: params.content.length,
  }
}

/**
 * Arena Copilot file writes put the whole markdown / office JS in tool args.
 * Strip that body from the mothership-facing call frame so the assistant row
 * can persist after the turn completes.
 */
export function stripLocalFileBodyToolParams(
  toolName: string,
  params: Record<string, unknown>
): Record<string, unknown> {
  if (!FILE_BODY_TOOL_NAMES.has(toolName)) return params
  const stripped = omitFileBodyContent(params)
  const nested = isPlainRecord(stripped.args) ? stripped.args : undefined
  if (!nested || typeof nested.content !== 'string') return stripped
  return {
    ...stripped,
    args: {
      ...omit(nested, ['content']),
      contentOmitted: true,
      contentChars: nested.content.length,
    },
  }
}

export function localFileBodyContent(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined
  if (typeof args.content === 'string') return args.content
  const nested = isPlainRecord(args.args) ? args.args : undefined
  return typeof nested?.content === 'string' ? nested.content : undefined
}

/**
 * File ids from Arena Copilot file tools, including `edit_content` which the
 * shared extractor does not treat as a resource tool.
 */
export function extractLocalFileChatResources(
  toolName: string,
  params: Record<string, unknown> | undefined,
  output: unknown
): MothershipResource[] {
  const extracted = extractResourcesFromToolResult(toolName, params, output)
  if (extracted.length > 0) return extracted
  if (toolName !== 'edit_content') return []

  const result = toRecord(output)
  const data = toRecord(result.data)
  const file = toRecord(data.file)
  const fileId =
    (typeof file.id === 'string' && file.id) ||
    (typeof data.fileId === 'string' && data.fileId) ||
    (typeof data.id === 'string' && data.id) ||
    undefined
  if (!fileId) return []
  const title =
    (typeof file.name === 'string' && file.name) ||
    (typeof data.fileName === 'string' && data.fileName) ||
    (typeof data.name === 'string' && data.name) ||
    'File'
  return [{ type: 'file', id: fileId, title }]
}
