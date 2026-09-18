/**
 * Relative path only (same-origin). Rejects scheme-relative and absolute URLs.
 */
export function sanitizeReturnPath(returnPath: string | null | undefined): string {
  const raw = (returnPath ?? '/workspace').trim() || '/workspace'
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) {
    return '/workspace'
  }
  return raw
}

export function normalizeAud(aud: string): string {
  return aud.trim().replace(/\/$/, '')
}
