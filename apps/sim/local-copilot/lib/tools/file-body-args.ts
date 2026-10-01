/**
 * Models put markdown / office JS in `content` or in common aliases
 * (`code`, `script`, …). Shared so persist stripping, arg enrichment, and
 * live preview all read the same keys.
 */
export const FILE_BODY_ARG_KEYS = [
  'content',
  'code',
  'body',
  'text',
  'script',
  'js',
  'javascript',
] as const

export function firstFileBodyString(params: Record<string, unknown>): string | undefined {
  for (const key of FILE_BODY_ARG_KEYS) {
    const value = params[key]
    if (typeof value === 'string' && value.length > 0) return value
    // Claude often passes JSON as a native object/array in `content`.
    if (value && typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2)
      } catch {}
    }
  }
  return undefined
}
