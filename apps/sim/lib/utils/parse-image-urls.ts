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

/** Regex to match http/https URLs in text (captures full URL). */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi

/**
 * Extract image URLs from plain text (e.g. prompt).
 *
 * @param text - Text that may contain URLs
 * @returns Array of unique URL strings found in the text
 */
export function extractUrlsFromText(text: unknown): string[] {
  if (text === null || text === undefined) return []
  const str = typeof text === 'string' ? text : String(text)
  if (!str.trim()) return []
  const matches = str.match(URL_REGEX) ?? []
  return [...new Set(matches.map((m) => m.trim()).filter(isHttpUrl))]
}

/**
 * Merge multiple URL arrays and remove duplicates (first occurrence wins).
 *
 * @param urlArrays - Arrays of URLs to merge
 * @returns Deduplicated array preserving order of first occurrence
 */
export function mergeUrlsAndDeduplicate(...urlArrays: string[][]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const arr of urlArrays) {
    for (const url of arr) {
      const normalized = url.trim()
      if (normalized && isHttpUrl(normalized) && !seen.has(normalized)) {
        seen.add(normalized)
        result.push(normalized)
      }
    }
  }
  return result
}
