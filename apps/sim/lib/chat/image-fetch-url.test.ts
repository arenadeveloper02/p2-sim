import { describe, expect, it } from 'vitest'
import { getChatImageFetchUrl, resolveChatImageSourceUrl } from '@/lib/chat/image-fetch-url'

const DEPLOYED_ORIGIN = 'https://deployed-chat.example.com'

describe('getChatImageFetchUrl', () => {
  it('keeps same-origin serve URLs on the current origin', () => {
    expect(
      getChatImageFetchUrl(
        'https://deployed-chat.example.com/api/files/serve/agent-generated-images%2Fw%2Fu%2Fimg.png',
        { origin: DEPLOYED_ORIGIN }
      )
    ).toBe(
      'https://deployed-chat.example.com/api/files/serve/agent-generated-images%2Fw%2Fu%2Fimg.png'
    )
  })

  it('proxies cross-origin serve URLs instead of rewriting to the current host', () => {
    const storedUrl =
      'https://test-agent.thearena.ai/api/files/serve/agent-generated-images%2Fworkflow%2Fuser%2Fone.jpeg'

    expect(getChatImageFetchUrl(storedUrl, { origin: DEPLOYED_ORIGIN })).toBe(
      `https://deployed-chat.example.com/api/files/proxy-image?url=${encodeURIComponent(storedUrl)}`
    )
  })

  it('proxies cross-origin non-serve image URLs', () => {
    const externalUrl = 'https://cdn.example.com/generated.png'

    expect(getChatImageFetchUrl(externalUrl, { origin: DEPLOYED_ORIGIN })).toBe(
      `https://deployed-chat.example.com/api/files/proxy-image?url=${encodeURIComponent(externalUrl)}`
    )
  })

  it('resolves relative serve paths against the current origin', () => {
    expect(
      getChatImageFetchUrl('/api/files/serve/agent-generated-images/w/u/img.png', {
        origin: DEPLOYED_ORIGIN,
      })
    ).toBe('https://deployed-chat.example.com/api/files/serve/agent-generated-images/w/u/img.png')
  })

  it('returns data URLs unchanged', () => {
    const dataUrl = 'data:image/png;base64,abc'
    expect(getChatImageFetchUrl(dataUrl, { origin: DEPLOYED_ORIGIN })).toBe(dataUrl)
  })

  it('keeps existing serve URLs unchanged when a storage key is also present', () => {
    const serveUrl =
      'http://localhost:3000/api/files/serve/agent-generated-images/workflow-1/user-1/image.png'
    expect(
      resolveChatImageSourceUrl({
        key: 'agent-generated-images/workflow-1/user-1/image.png',
        url: serveUrl,
      })
    ).toBe(serveUrl)
  })

  it('uses storage key for presigned URLs when reusing an image', () => {
    expect(
      resolveChatImageSourceUrl({
        key: 'agent-generated-images/workflow-1/user-1/image.png',
        url: 'https://bucket.s3.amazonaws.com/tmp/presigned?expires=1',
      })
    ).toBe('/api/files/serve/agent-generated-images%2Fworkflow-1%2Fuser-1%2Fimage.png')
  })
})
