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
      .filter((v): v is string => typeof v === 'string' && (isHttpUrl(v) || v.startsWith('s3://')))
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
          .filter(
            (v): v is string => typeof v === 'string' && (isHttpUrl(v) || v.startsWith('s3://'))
          )
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
    if (trimmed && (isHttpUrl(trimmed) || trimmed.startsWith('s3://'))) {
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

/** Regex to match s3:// URIs in text (e.g. plain or inside markdown links like [text](s3://bucket/key)). */
const S3_URI_REGEX = /s3:\/\/[^/\s]+\/[^\s)"\]\]]+/gi

/**
 * Extract image URLs from plain text (e.g. prompt).
 * Includes both http(s) URLs and S3 URIs (e.g. s3://bucket/key).
 *
 * @param text - Text that may contain URLs or S3 URIs
 * @returns Array of unique URL/URI strings found in the text
 */
export function extractUrlsFromText(text: unknown): string[] {
  if (text === null || text === undefined) return []
  const str = typeof text === 'string' ? text : String(text)
  if (!str.trim()) return []
  const httpMatches = str.match(URL_REGEX) ?? []
  const s3Matches = str.match(S3_URI_REGEX) ?? []
  const httpUrls = httpMatches.map((m) => m.trim()).filter(isHttpUrl)
  const s3Uris = s3Matches.map((m) => m.trim()).filter((s) => s.startsWith('s3://'))
  return [...new Set([...httpUrls, ...s3Uris])]
}

/**
 * Merge multiple URL arrays and remove duplicates (first occurrence wins).
 * Accepts both http(s) URLs and S3 URIs.
 *
 * @param urlArrays - Arrays of URLs/URIs to merge
 * @returns Deduplicated array preserving order of first occurrence
 */
export function mergeUrlsAndDeduplicate(...urlArrays: string[][]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const arr of urlArrays) {
    for (const url of arr) {
      const normalized = url.trim()
      if (
        normalized &&
        (isHttpUrl(normalized) || normalized.startsWith('s3://')) &&
        !seen.has(normalized)
      ) {
        seen.add(normalized)
        result.push(normalized)
      }
    }
  }
  return result
}

/**
 * Check if a string is an S3 URI (s3://bucket/key).
 */
export function isS3Uri(s: string): boolean {
  return s.startsWith('s3://')
}

/** MIME types for common image extensions. */
const EXT_TO_MIME: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tiff: 'image/tiff',
  tif: 'image/tiff',
}

/**
 * Convert an S3 URI to a path object for api-service (resolveInlineImageData).
 * The api-service downloads from S3 via downloadFile when given { path: s3Uri }.
 *
 * @param s3Uri - S3 URI (e.g. s3://bucket/key/image.svg)
 * @returns Object with path and optional type for inline image resolution
 */
export function s3UriToPathObject(s3Uri: string): { path: string; type?: string } {
  const ext = s3Uri.split('.').pop()?.toLowerCase()
  const type = ext ? EXT_TO_MIME[ext] : undefined
  return { path: s3Uri.trim(), ...(type && { type }) }
}
