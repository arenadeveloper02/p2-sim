/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '@/stores/chat/store'

describe('chat store appendMessageImages', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [
        {
          id: 'msg-1',
          content: {
            content: 'here is an image',
            images: ['/api/files/serve/agent-generated-images/wf/u/a.png'],
          },
          workflowId: 'wf-1',
          type: 'workflow',
          timestamp: new Date().toISOString(),
          generatedImages: [
            {
              id: 'generated-image:1',
              name: 'Generated image',
              url: '/api/files/serve/agent-generated-images/wf/u/a.png',
              type: 'image/png',
              key: 'agent-generated-images/wf/u/a.png',
            },
          ],
        },
      ],
    })
  })

  it('appends a new image URL onto content.images and generatedImages', () => {
    const nextUrl = '/api/files/serve/agent-generated-images/wf/u/b.png'
    useChatStore.getState().appendMessageImages('msg-1', [nextUrl])

    const message = useChatStore.getState().messages.find((m) => m.id === 'msg-1')
    expect(message?.content).toMatchObject({
      content: 'here is an image',
      images: [
        '/api/files/serve/agent-generated-images/wf/u/a.png',
        nextUrl,
      ],
    })
    expect(message?.generatedImages).toHaveLength(2)
    expect(message?.generatedImages?.[1]?.url).toBe(nextUrl)
  })

  it('deduplicates by normalized URL', () => {
    useChatStore
      .getState()
      .appendMessageImages('msg-1', ['/api/files/serve/agent-generated-images/wf/u/a.png'])

    const message = useChatStore.getState().messages.find((m) => m.id === 'msg-1')
    expect(message?.content.images).toHaveLength(1)
    expect(message?.generatedImages).toHaveLength(1)
  })
})
