/**
 * Segment of a welcome message after splitting on `{{query}}` CTA tokens.
 */
export type WelcomeSegment =
  | { type: 'text'; value: string }
  | { type: 'query'; value: string; raw: string }

/**
 * Parses welcome-message content into plain text and clickable `{{query}}` CTA segments.
 */
export function parseWelcomeSegments(content: string): WelcomeSegment[] {
  const segments: WelcomeSegment[] = []
  const pattern = /\{\{([\s\S]*?)\}\}/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content)) !== null) {
    const fullMatch = match[0]
    const innerText = match[1] ?? ''
    const start = match.index
    const end = start + fullMatch.length

    if (start > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, start) })
    }

    const query = innerText.trim()
    if (query.length > 0) {
      segments.push({ type: 'query', value: query, raw: fullMatch })
    } else {
      segments.push({ type: 'text', value: fullMatch })
    }

    lastIndex = end
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) })
  }

  return segments
}
