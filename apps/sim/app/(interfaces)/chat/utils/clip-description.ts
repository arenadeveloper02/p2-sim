export const DEPLOYED_CHAT_DESCRIPTION_MAX_LENGTH = 400

export interface ClippedDescription {
  displayText: string
  isTruncated: boolean
  fullText: string
}

/**
 * Normalizes text for duplicate title comparisons.
 */
export function normalizeComparableText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Resolves landing description text while omitting values that duplicate the title.
 */
export function resolveDeployedChatLandingDescription(params: {
  title: string
  welcomeMessage?: string
}): string {
  const titleNorm = normalizeComparableText(params.title)
  const welcomeMessage = params.welcomeMessage?.trim() || ''

  if (welcomeMessage && normalizeComparableText(welcomeMessage) !== titleNorm) {
    return welcomeMessage
  }

  return ''
}

/**
 * Clips description text for the deployed chat landing view.
 */
export function clipDeployedChatDescription(
  text: string,
  maxLength = DEPLOYED_CHAT_DESCRIPTION_MAX_LENGTH
): ClippedDescription {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) {
    return { displayText: trimmed, isTruncated: false, fullText: trimmed }
  }

  const clipped = `${trimmed.slice(0, maxLength).trimEnd()}...`
  return { displayText: clipped, isTruncated: true, fullText: trimmed }
}

/**
 * Extracts a display first name from a user name or email.
 */
export function getDeployedChatFirstName(userName: string | null | undefined): string | null {
  if (!userName) return null
  const trimmed = userName.trim()
  if (!trimmed) return null
  if (trimmed.includes('@')) return trimmed.split('@')[0] || null
  return trimmed.split(/\s+/)[0] || null
}
