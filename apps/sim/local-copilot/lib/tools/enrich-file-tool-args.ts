import { truncate } from '@sim/utils/string'

const OFFICE_FILE_EXTENSION = /\.(pptx|docx|pdf)$/i

/**
 * Parses a JSON object string once when models stringify nested tool args.
 */
function tryParseJsonObject(value: string): Record<string, unknown> | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }
  return null
}

function basenameWithoutExtension(path: string): string {
  const base = path.split('/').pop()?.trim() || path.trim()
  const withoutExt = base.replace(/\.[^.]+$/, '')
  return withoutExt || base
}

function resolveCreateFilePath(args: Record<string, unknown>): string {
  if (typeof args.fileName === 'string' && args.fileName.trim()) {
    return args.fileName.trim()
  }
  if (args.outputs && typeof args.outputs === 'object' && !Array.isArray(args.outputs)) {
    const files = (args.outputs as { files?: unknown }).files
    if (Array.isArray(files) && files[0] && typeof files[0] === 'object') {
      const path = (files[0] as { path?: unknown }).path
      if (typeof path === 'string') return path.trim()
    }
  }
  return ''
}

/**
 * Normalizes common `create_file` arg mistakes so AJV does not reject the call.
 * Models often pass a string/array for `outputs` or a bare `path`/`name` instead of `fileName`.
 */
export function enrichCreateFileArgs(args: Record<string, unknown>): void {
  if (typeof args.outputs === 'string') {
    const raw = args.outputs.trim()
    const asObject = tryParseJsonObject(raw)
    if (asObject) {
      args.outputs = asObject
    } else if (raw) {
      args.outputs = { files: [{ path: raw, mode: 'create' }] }
    }
  }

  if (Array.isArray(args.outputs)) {
    const files = args.outputs
      .map((item) => {
        if (typeof item === 'string' && item.trim()) {
          return { path: item.trim(), mode: 'create' as const }
        }
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const file = item as Record<string, unknown>
          const path = typeof file.path === 'string' ? file.path.trim() : ''
          if (!path) return null
          return {
            path,
            mode: typeof file.mode === 'string' ? file.mode : 'create',
            ...(typeof file.mimeType === 'string' ? { mimeType: file.mimeType } : {}),
          }
        }
        return null
      })
      .filter((file): file is NonNullable<typeof file> => file !== null)
    args.outputs = { files }
  }

  if (typeof args.fileName !== 'string' || !args.fileName.trim()) {
    if (typeof args.path === 'string' && args.path.trim()) {
      args.fileName = args.path.trim()
    } else if (typeof args.name === 'string' && args.name.trim()) {
      args.fileName = args.name.trim()
    }
  }

  // Office shells reject inline content — drop it so create_file can succeed.
  const createPath = resolveCreateFilePath(args)
  if (createPath && OFFICE_FILE_EXTENSION.test(createPath) && 'content' in args) {
    args.content = undefined
  }
}

/**
 * Normalizes common `workspace_file` arg mistakes so AJV does not reject the call.
 * Models often pass `target` as a path string and omit required `title`.
 */
export function enrichWorkspaceFileArgs(args: Record<string, unknown>): void {
  if (typeof args.target === 'string') {
    const raw = args.target.trim()
    const asObject = tryParseJsonObject(raw)
    if (asObject) {
      args.target = asObject
    } else if (raw) {
      args.target = { kind: 'path', path: raw }
    }
  }

  if (args.target && typeof args.target === 'object' && !Array.isArray(args.target)) {
    const target = args.target as Record<string, unknown>
    if (typeof target.path === 'string') {
      target.path = target.path.trim()
    }
    if (!target.kind && typeof target.path === 'string' && target.path) {
      target.kind = 'path'
    }
    // Schema currently only allows kind=path; prefer path when both are present.
    if (target.kind === 'file_id' && typeof target.path === 'string' && target.path) {
      target.kind = 'path'
    }
  }

  if (!args.target) {
    if (typeof args.path === 'string' && args.path.trim()) {
      args.target = { kind: 'path', path: args.path.trim() }
    } else if (typeof args.filePath === 'string' && args.filePath.trim()) {
      args.target = { kind: 'path', path: args.filePath.trim() }
    }
  }

  if (typeof args.operation !== 'string' || !args.operation.trim()) {
    args.operation = 'update'
  }

  if (typeof args.title !== 'string' || !args.title.trim()) {
    const target = args.target
    if (target && typeof target === 'object' && !Array.isArray(target)) {
      const path =
        typeof (target as Record<string, unknown>).path === 'string'
          ? ((target as Record<string, unknown>).path as string)
          : ''
      if (path) {
        args.title = truncate(basenameWithoutExtension(path), 48)
      }
    }
  }
}

/**
 * Remaps common `edit_content` aliases when the model omits required `content`.
 */
export function enrichEditContentArgs(args: Record<string, unknown>): void {
  if (typeof args.content === 'string' && args.content.length > 0) return

  for (const key of ['code', 'body', 'text', 'script', 'js', 'javascript'] as const) {
    const value = args[key]
    if (typeof value === 'string' && value.length > 0) {
      args.content = value
      return
    }
  }
}
