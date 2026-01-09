/**
 * Extracts user IDs from HTML mentions
 * This function parses HTML content and extracts all user IDs from mention tags
 *
 * @param html - HTML string containing mention tags
 * @returns Array of user IDs found in mentions
 */
export function extractMentionedUserIds(html: string): string[] {
  if (!html) return []

  const userIds: string[] = []

  // First, try to find all <a> tags with class="mention" and extract data-user-id
  // This regex handles various attribute orders and quote styles
  const mentionTagRegex = /<a\s+[^>]*class\s*=\s*["']mention["'][^>]*>/gi
  let tagMatch: RegExpExecArray | null

  while ((tagMatch = mentionTagRegex.exec(html)) !== null) {
    const tagContent = tagMatch[0]
    // Extract data-user-id from this tag
    const userIdMatch = tagContent.match(/data-user-id\s*=\s*["']([^"']+)["']/i)
    if (userIdMatch?.[1]) {
      const userId = userIdMatch[1]
      if (!userIds.includes(userId)) {
        userIds.push(userId)
      }
    }
  }

  // Fallback: if no mentions found with class="mention", try finding any data-user-id
  // This handles edge cases where the class might be missing or different
  if (userIds.length === 0) {
    const allUserIdRegex = /data-user-id\s*=\s*["']([^"']+)["']/gi
    let fallbackMatch: RegExpExecArray | null
    while ((fallbackMatch = allUserIdRegex.exec(html)) !== null) {
      const userId = fallbackMatch[1]
      if (userId && !userIds.includes(userId)) {
        userIds.push(userId)
      }
    }
  }

  return userIds
}
