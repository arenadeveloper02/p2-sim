import type { ChatMessageContentPart } from '@/local-copilot/lib/providers/types'

/**
 * Returns the text portions of a chat message for token estimation and logging.
 */
export function getMessageContentText(content: string | ChatMessageContentPart[]): string {
  if (typeof content === 'string') return content
  return content
    .filter((part): part is Extract<ChatMessageContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}

/**
 * Collapses a single text part back to a plain string for providers that only accept text.
 */
export function toPlainMessageContent(
  content: string | ChatMessageContentPart[]
): string | ChatMessageContentPart[] {
  if (typeof content === 'string') return content
  if (content.length === 1 && content[0]?.type === 'text') return content[0].text
  return content
}
