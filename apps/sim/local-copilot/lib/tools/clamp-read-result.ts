import { truncate } from '@sim/utils/string'

/**
 * Soft cap for a single text line returned to the Local Copilot model.
 * Arena/Figma HTML often packs multi-hundred-KB SVG path dumps on one line.
 */
export const LOCAL_VFS_READ_MAX_LINE_CHARS = 8_000

/**
 * Soft cap for the whole Local Copilot read window after line clamping.
 * Kept well under typical provider tool-result budgets.
 */
export const LOCAL_VFS_READ_SOFT_MAX_CHARS = 96_000

const MEGA_LINE_HINT =
  '…[line truncated — mega inline SVG/CSS/base64; use grep + workspace_file patch, never full-rewrite]'

const BODY_TRUNCATION_HINT =
  '\n…[truncated for Local Copilot budget — retry read with offset/limit, or grep then workspace_file patch. Do not regenerate the whole file.]'

export interface LocalClampedReadResult {
  content: string
  totalLines: number
  truncated?: boolean
  truncationHint?: string
}

/**
 * Shrinks an oversized text read for Local Copilot so complex HTML can be
 * inspected and patched instead of hard-failing the turn.
 */
export function clampReadResultForLocalModel<T extends { content: string; totalLines: number }>(
  result: T,
  options?: { maxChars?: number; maxLineChars?: number }
): T & LocalClampedReadResult {
  const maxChars = options?.maxChars ?? LOCAL_VFS_READ_SOFT_MAX_CHARS
  const maxLineChars = options?.maxLineChars ?? LOCAL_VFS_READ_MAX_LINE_CHARS
  let content = result.content
  let truncated = false

  if (content.length > maxLineChars || content.includes('\n')) {
    const lines = content.split('\n')
    let lineClamped = false
    const next = lines.map((line) => {
      if (line.length <= maxLineChars) return line
      lineClamped = true
      return truncate(line, maxLineChars, MEGA_LINE_HINT)
    })
    if (lineClamped) {
      content = next.join('\n')
      truncated = true
    }
  }

  if (content.length > maxChars) {
    content = truncate(content, maxChars, BODY_TRUNCATION_HINT)
    truncated = true
  }

  if (!truncated) return result

  return {
    ...result,
    content,
    truncated: true,
    truncationHint:
      'File exceeds the Local Copilot read budget (often mega inline SVG/CSS). Prefer grep + workspace_file patch. Never regenerate the entire page.',
  }
}
