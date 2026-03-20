/**
 * Parse image URLs from various input formats (Option 4 - flexible parsing).
 * Supports: array, JSON string, newline-separated, comma-separated.
 *
 * @param value - Raw value from block param (resolved or literal)
 * @returns Array of URL strings, empty if none valid
 */
export function parseImageUrls(value: unknown): string[] {
  if (value === null || value === undefined) {
    return []
  }

  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === 'string' && isHttpUrl(v))
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const str = typeof value === 'string' ? value.trim() : String(value).trim()
  if (!str) return []

  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str) as unknown
      if (Array.isArray(parsed)) {
        return parsed
          .filter((v): v is string => typeof v === 'string' && isHttpUrl(v))
          .map((s) => s.trim())
          .filter(Boolean)
      }
    } catch {
      // Fall through to newline/comma parsing
    }
  }

  const urls: string[] = []
  const parts = str.split(/[\n,]+/)
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed && isHttpUrl(trimmed)) {
      urls.push(trimmed)
    }
  }
  return urls
}

function isHttpUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://')
}
