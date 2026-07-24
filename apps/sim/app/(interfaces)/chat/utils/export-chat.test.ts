/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/app/(interfaces)/chat/components/message/ArenaClientChatMessage'
import { exportChatAsMarkdown } from '@/app/(interfaces)/chat/utils/export-chat'

function message(partial: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'type' | 'content'>): ChatMessage {
  return {
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    ...partial,
  }
}

describe('exportChatAsMarkdown', () => {
  it('includes an optional title header', () => {
    const markdown = exportChatAsMarkdown(
      [message({ id: '1', type: 'user', content: 'Hello' })],
      'My Chat'
    )

    expect(markdown.startsWith('# My Chat\n\n')).toBe(true)
    expect(markdown).toContain('## You')
    expect(markdown).toContain('Hello')
  })

  it('labels user and assistant messages', () => {
    const markdown = exportChatAsMarkdown([
      message({ id: '1', type: 'user', content: 'Question' }),
      message({ id: '2', type: 'assistant', content: 'Answer' }),
    ])

    expect(markdown).toContain('## You\n\nQuestion')
    expect(markdown).toContain('## Assistant\n\nAnswer')
  })

  it('skips initial welcome messages', () => {
    const markdown = exportChatAsMarkdown([
      message({
        id: 'welcome',
        type: 'assistant',
        content: 'Welcome',
        isInitialMessage: true,
      }),
      message({ id: '1', type: 'user', content: 'Hi' }),
    ])

    expect(markdown).not.toContain('Welcome')
    expect(markdown).toContain('## You\n\nHi')
  })

  it('stringifies object content', () => {
    const markdown = exportChatAsMarkdown([
      message({
        id: '1',
        type: 'assistant',
        content: { status: 'ok', count: 2 },
      }),
    ])

    expect(markdown).toContain('"status": "ok"')
    expect(markdown).toContain('"count": 2')
  })

  it('returns an empty string when there are no exportable messages', () => {
    expect(
      exportChatAsMarkdown([
        message({
          id: 'welcome',
          type: 'assistant',
          content: 'Welcome',
          isInitialMessage: true,
        }),
      ])
    ).toBe('')
  })
})
