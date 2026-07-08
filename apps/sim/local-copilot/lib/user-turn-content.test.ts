/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockReadChatUpload } = vi.hoisted(() => ({
  mockReadChatUpload: vi.fn(),
}))

vi.mock('@/lib/copilot/tools/handlers/upload-file-reader', () => ({
  readChatUpload: mockReadChatUpload,
}))

import { buildLocalCopilotUserTurn } from '@/local-copilot/lib/user-turn-content'

describe('buildLocalCopilotUserTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns plain text when there are no uploads', async () => {
    const message = await buildLocalCopilotUserTurn({ message: 'Hello' })
    expect(message).toEqual({ role: 'user', content: 'Hello' })
  })

  it('appends upload context text and inlines image vision blocks', async () => {
    mockReadChatUpload.mockResolvedValue({
      content: 'Image: screenshot.png (12.0KB, image/png)',
      totalLines: 1,
      attachment: {
        type: 'image',
        name: 'screenshot.png',
        source: { type: 'base64', media_type: 'image/png', data: 'img-data' },
      },
    })

    const message = await buildLocalCopilotUserTurn({
      message: 'Describe this',
      chatId: 'chat-1',
      contexts: [
        {
          type: 'uploaded_file',
          content:
            'File "screenshot.png" (image/png, 1024 bytes) uploaded.\nRead with: read("uploads/screenshot.png")',
        },
      ],
    })

    expect(mockReadChatUpload).toHaveBeenCalledWith('screenshot.png', 'chat-1')
    expect(message).toEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Describe this\n\nFile "screenshot.png" (image/png, 1024 bytes) uploaded.\nRead with: read("uploads/screenshot.png")',
        },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'img-data' },
        },
      ],
    })
  })

  it('formats path-only context entries for the model', async () => {
    const message = await buildLocalCopilotUserTurn({
      message: 'Summarize this',
      contexts: [
        {
          type: 'file',
          tag: '@report',
          content: '',
          path: 'files/Q4%20Report.pdf/content',
        },
      ],
    })

    expect(message).toEqual({
      role: 'user',
      content:
        'Summarize this\n\n[@report]\nResource path: files/Q4%20Report.pdf/content\nRead with: read("files/Q4%20Report.pdf/content")',
    })
  })

  it('falls back to fileAttachments when upload context is missing', async () => {
    mockReadChatUpload.mockResolvedValue({
      content: 'Image: diagram.png (12.0KB, image/png)',
      totalLines: 1,
      attachment: {
        type: 'image',
        name: 'diagram.png',
        source: { type: 'base64', media_type: 'image/png', data: 'img-data' },
      },
    })

    const message = await buildLocalCopilotUserTurn({
      message: 'Describe this',
      chatId: 'chat-1',
      fileAttachments: [
        {
          key: 'chat/key',
          filename: 'diagram.png',
          media_type: 'image/png',
          size: 1024,
        },
      ],
    })

    expect(mockReadChatUpload).toHaveBeenCalledWith('diagram.png', 'chat-1')
    expect(message.content).toEqual(
      expect.arrayContaining([
        { type: 'text', text: 'Describe this' },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'img-data' },
        },
      ])
    )
  })
})
