/**
 * Check if a value is a variable reference (starts with <)
 * This helps determine when to skip API fetches in the UI
 *
 * Examples:
 * - <loop.currentItem>[0] → true
 * - <block.field> → true
 * - <variable.name> → true
 * - "prefix<variable>suffix" → false (concatenation, not pure variable)
 * - "StaticValue" → false
 */
export function isVariable(value: any): boolean {
  if (!value) return false
  const stringValue = typeof value === 'string' ? value : String(value)
  const trimmed = stringValue.trim()

  // Must start with < and contain at least one character before closing >
  // This ensures we catch variables like <loop.currentItem>, <block.field>, etc.
  // But not concatenated strings like "prefix<variable>suffix"
  return trimmed.startsWith('<') && trimmed.length > 1
}
