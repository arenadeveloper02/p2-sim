import type { ChatMessage } from '@/app/chat/components/message/ArenaClientChatMessage'

/**
 * Serializes loaded chat messages to Markdown for download.
 */
export function exportChatAsMarkdown(messages: ChatMessage[], title?: string): string {
  const lines: string[] = []
  if (title) {
    lines.push(`# ${title}`, '')
  }

  for (const message of messages) {
    if (message.isInitialMessage) continue
    const role = message.type === 'user' ? 'You' : 'Assistant'
    const content =
      typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content, null, 2)
    lines.push(`## ${role}`, '', content, '')
  }

  return lines.join('\n').trim()
}

export function downloadTextFile(content: string, filename: string, mimeType = 'text/markdown') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
