/**
 * Extracts user IDs from HTML mentions
 * This function parses HTML content and extracts all user IDs from mention tags
 *
 * @param html - HTML string containing mention tags
 * @returns Array of user IDs found in mentions
 */
export function extractMentionedUserIds(html: string): string[] {
  if (!html) return []

  // Use regex to extract user IDs from mention tags
  // Format: <a class="mention" data-mention="@UserName" data-user-id="userId">@UserName</a>
  const mentionRegex = /<a\s+class=["']mention["'][^>]*data-user-id=["']([^"']+)["'][^>]*>/gi
  const userIds: string[] = []
  let match: RegExpExecArray | null

  while ((match = mentionRegex.exec(html)) !== null) {
    const userId = match[1]
    if (userId && !userIds.includes(userId)) {
      userIds.push(userId)
    }
  }

  return userIds
}

