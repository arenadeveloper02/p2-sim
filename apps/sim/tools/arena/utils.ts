import { REFERENCE } from '@/executor/constants'

/**
 * Gets a nested value from an object using dot notation path
 */
function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current == null) return undefined
    current = current[part]
  }
  return current
}

/**
 * Resolves tag variables (like <agent1.content>) in HTML string
 * This function finds all <tag_name> patterns and replaces them with their resolved values
 * from blockData, while preserving HTML structure (especially mention tags)
 *
 * @param html - HTML string that may contain tag variables
 * @param blockData - Block output data for variable resolution
 * @param blockNameMapping - Mapping of block names to block IDs
 * @returns HTML string with tag variables resolved
 */
export function resolveTagVariablesInHtml(
  html: string,
  blockData: Record<string, any> = {},
  blockNameMapping: Record<string, string> = {}
): string {
  if (!html) return html

  // Common HTML tag names to avoid matching
  const htmlTagNames = new Set([
    'p',
    'div',
    'span',
    'a',
    'img',
    'br',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'table',
    'tr',
    'td',
    'th',
    'thead',
    'tbody',
    'tfoot',
    'form',
    'input',
    'button',
    'select',
    'option',
    'textarea',
    'label',
    'script',
    'style',
    'link',
    'meta',
    'head',
    'body',
    'html',
    'title',
  ])

  // Pattern to match <tag_name> or <block.field.path>
  // We match patterns that look like variable references (contain dots or are longer)
  const tagPattern = new RegExp(
    `${REFERENCE.START}([a-zA-Z_][a-zA-Z0-9_${REFERENCE.PATH_DELIMITER}]*[a-zA-Z0-9_])${REFERENCE.END}`,
    'g'
  )

  return html.replace(tagPattern, (match, tagName) => {
    // Skip if this looks like an HTML tag (single word, common HTML tag name)
    // Variable references are typically longer or contain dots
    const trimmedTagName = tagName.trim()

    // If it's a single word and matches common HTML tag names, skip it
    if (
      !trimmedTagName.includes(REFERENCE.PATH_DELIMITER) &&
      htmlTagNames.has(trimmedTagName.toLowerCase())
    ) {
      return match
    }

    // Try to get the value from blockData directly
    let tagValue = getNestedValue(blockData, trimmedTagName)

    // If not found and the path contains a dot, try mapping block name to ID
    if (tagValue === undefined && trimmedTagName.includes(REFERENCE.PATH_DELIMITER)) {
      const pathParts = trimmedTagName.split(REFERENCE.PATH_DELIMITER)
      const normalizedBlockName = pathParts[0]

      // Try to find block ID from name mapping
      const blockId = blockNameMapping[normalizedBlockName]

      if (blockId) {
        const remainingPath = pathParts.slice(1).join('.')
        const fullPath = remainingPath ? `${blockId}.${remainingPath}` : blockId
        tagValue = getNestedValue(blockData, fullPath)
      }
    }

    // If value is found, convert to string
    if (tagValue !== undefined && tagValue !== null) {
      // Convert to string, handling objects/arrays
      const resolvedValue = typeof tagValue === 'string' ? tagValue : JSON.stringify(tagValue)

      // Note: We don't escape HTML here because:
      // 1. The resolved value is typically plain text
      // 2. If it contains HTML, it should be preserved as-is
      // 3. The HTML structure around it (like <p> tags and mention tags) is preserved

      return resolvedValue
    }

    // If not found, return the original match (keep unresolved)
    return match
  })
}

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
