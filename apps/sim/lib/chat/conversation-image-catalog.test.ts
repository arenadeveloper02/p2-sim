/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  listConversationFileOptions,
  toConversationImageRef,
} from '@/lib/chat/conversation-image-catalog'
import { CONVERSATION_IMAGE_REF_SOURCE } from '@/lib/image-generation/reference-files'

describe('conversation-image-catalog', () => {
  it('lists generated and attachment images from workflow messages', () => {
    const options = listConversationFileOptions([
      {
        id: 'msg-1',
        generatedImages: [
          {
            id: 'gen-1',
            name: 'Hero',
            url: 'https://example.com/hero.png',
            type: 'image/png',
          },
        ],
        attachments: [
          {
            id: 'att-1',
            filename: 'logo.png',
            media_type: 'image/png',
            previewUrl: 'https://example.com/logo.png',
          },
          {
            id: 'att-2',
            filename: 'notes.txt',
            media_type: 'text/plain',
            previewUrl: 'https://example.com/notes.txt',
          },
        ],
      },
    ])

    expect(options).toHaveLength(2)
    expect(options.map((option) => option.id)).toEqual(['gen-1', 'att-1'])
    expect(toConversationImageRef(options[0]!)).toMatchObject({
      source: CONVERSATION_IMAGE_REF_SOURCE,
      id: 'gen-1',
      messageId: 'msg-1',
    })
  })

  it('includes non-image attachments when mode is all', () => {
    const options = listConversationFileOptions(
      [
        {
          id: 'msg-1',
          attachments: [
            {
              id: 'att-pdf',
              filename: 'report.pdf',
              media_type: 'application/pdf',
              previewUrl: 'https://example.com/report.pdf',
            },
          ],
        },
      ],
      { mode: 'all' }
    )

    expect(options).toHaveLength(1)
    expect(options[0]?.name).toBe('report.pdf')
  })
})
