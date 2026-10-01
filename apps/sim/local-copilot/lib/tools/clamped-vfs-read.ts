import { createLogger } from '@sim/logger'
import { getOrMaterializeVFS } from '@/lib/copilot/vfs'
import { isOversizedReadPlaceholder } from '@/lib/copilot/vfs/read-placeholders'
import { clampReadResultForLocalModel } from '@/local-copilot/lib/tools/clamp-read-result'
import type { ToolExecutionContext, ToolExecutionResult } from '@/local-copilot/lib/tools/executor'

const logger = createLogger('LocalCopilotClampedVfsRead')

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function applyLineWindow<T extends { content: string; totalLines: number }>(
  result: T,
  offset: number | undefined,
  limit: number | undefined
): T {
  if (offset === undefined && limit === undefined) return result
  const lines = result.content.split('\n')
  const start = Math.max(0, Math.min(lines.length, offset ?? 0))
  const endRaw = limit !== undefined ? start + Math.max(0, limit) : lines.length
  const end = Math.max(start, Math.min(lines.length, endRaw))
  return {
    ...result,
    content: lines.slice(start, end).join('\n'),
  }
}

function hasModelAttachment(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const attachment = (result as { attachment?: { type?: string } }).attachment
  return (
    attachment?.type === 'image' || attachment?.type === 'file' || attachment?.type === 'document'
  )
}

/** True when shared vfs_read refused because the body exceeded the inline budget. */
export function isOversizedVfsReadError(error: string | undefined): boolean {
  if (!error) return false
  return /too large to return inline|too large to display inline|File too large|Document too large|Image too large/i.test(
    error
  )
}

/**
 * Soft-clamps a successful Local Copilot `read` payload (mega SVG lines, etc.).
 */
export function clampSuccessfulReadResult(result: ToolExecutionResult): ToolExecutionResult {
  if (!result.success || !result.result || typeof result.result !== 'object') return result
  if (hasModelAttachment(result.result)) return result
  const record = result.result as { content?: unknown; totalLines?: unknown }
  if (typeof record.content !== 'string') return result
  const totalLines =
    typeof record.totalLines === 'number' && Number.isFinite(record.totalLines)
      ? record.totalLines
      : record.content.split('\n').length
  const clamped = clampReadResultForLocalModel({
    ...(record as Record<string, unknown>),
    content: record.content,
    totalLines,
  })
  return { ...result, result: clamped }
}

/**
 * Local-only recovery when shared `read` hard-fails on Arena/Figma-scale HTML.
 * Re-reads via VFS, applies offset/limit, then clamps mega lines for the model.
 */
export async function recoverOversizedVfsReadForLocal(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult | null> {
  const path = typeof args.path === 'string' ? args.path.trim() : ''
  if (!path || !ctx.workspaceId) return null

  const offset = parseOptionalNumber(args.offset)
  const limit = parseOptionalNumber(args.limit)

  try {
    const vfs = await getOrMaterializeVFS(ctx.workspaceId, ctx.userId, {
      secretMountPolicy: undefined,
    })

    const shouldReadDynamicFileContent =
      /^recently-deleted\/files\/.+\/content$/.test(path) ||
      /^files\/.+\/(?:content|style|compiled-check|compiled|render|extract)$/.test(path)

    let raw: { content: string; totalLines: number; error?: string } | null = null

    if (shouldReadDynamicFileContent) {
      const envelope = await vfs.readFileContentWithProvenance(path)
      const value = envelope?.value
      if (!value) return null
      if (hasModelAttachment(value) || isOversizedReadPlaceholder(value)) return null
      if (typeof value.content !== 'string') return null
      raw = {
        content: value.content,
        totalLines: value.totalLines,
        ...(value.error !== undefined ? { error: value.error } : {}),
      }
    } else {
      const value = await vfs.read(path, offset, limit)
      if (!value) return null
      if (hasModelAttachment(value) || isOversizedReadPlaceholder(value)) return null
      if (typeof value.content !== 'string') return null
      raw = {
        content: value.content,
        totalLines: value.totalLines,
        ...(value.error !== undefined ? { error: value.error } : {}),
      }
    }

    if (raw.error) {
      return {
        toolName: 'read',
        success: false,
        error: raw.error,
        result: { success: false, error: raw.error },
      }
    }

    const windowed =
      shouldReadDynamicFileContent || (offset === undefined && limit === undefined)
        ? applyLineWindow(raw, offset, limit)
        : raw
    const clamped = clampReadResultForLocalModel(windowed)

    logger.info('Recovered oversized VFS read for Local Copilot', {
      path,
      rawChars: raw.content.length,
      clampedChars: clamped.content.length,
      truncated: clamped.truncated === true,
      offset,
      limit,
    })

    return {
      toolName: 'read',
      success: true,
      result: clamped,
    }
  } catch (error) {
    logger.warn('Local oversized VFS read recovery failed', {
      path,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
