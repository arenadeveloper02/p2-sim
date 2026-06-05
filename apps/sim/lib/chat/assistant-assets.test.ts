import { describe, expect, it } from 'vitest'
import {
  extractGeneratedImagesFromData,
  normalizeImageUrlForCompare,
  resolveSelectableGeneratedImage,
} from '@/lib/chat/assistant-assets'

describe('extractGeneratedImagesFromData', () => {
  it('ignores nested profile icon urls in non-image answer objects', () => {
    const images = extractGeneratedImagesFromData({
      message: {
        text: 'The meaning of life is personal.',
        bot_profile: {
          icons: {
            image_36: 'https://a.slack-edge.com/80588/img/plugins/app/bot_36.png',
            image_48: 'https://a.slack-edge.com/80588/img/plugins/app/bot_48.png',
            image_72: 'https://a.slack-edge.com/80588/img/plugins/app/service_72.png',
          },
        },
      },
    })

    expect(images).toEqual([])
  })

  it('extracts direct image outputs and explicit image fields', () => {
    expect(extractGeneratedImagesFromData('https://example.com/generated.png')).toHaveLength(1)

    const images = extractGeneratedImagesFromData({
      output: {
        images: ['https://example.com/generated-1.png', 'https://example.com/generated-2.webp'],
      },
    })

    expect(images.map((image) => image.url)).toEqual([
      'https://example.com/generated-1.png',
      'https://example.com/generated-2.webp',
    ])
    expect(images.map((image) => image.type)).toEqual(['image/png', 'image/webp'])
  })

  it('extracts image arrays selected directly as an output value', () => {
    const images = extractGeneratedImagesFromData([
      'https://test-agent.thearena.ai/api/files/serve/agent-generated-images%2Fworkflow%2Fuser%2Fone.jpeg',
      'https://test-agent.thearena.ai/api/files/serve/agent-generated-images%2Fworkflow%2Fuser%2Ftwo.jpeg',
      'https://test-agent.thearena.ai/api/files/serve/agent-generated-images%2Fworkflow%2Fuser%2Fthree.jpeg',
      'https://test-agent.thearena.ai/api/files/serve/agent-generated-images%2Fworkflow%2Fuser%2Ffour.jpeg',
    ])

    expect(images).toHaveLength(4)
  })

  it('preserves storage keys for internal serve URLs so chat reuse stays URL-based', () => {
    const images = extractGeneratedImagesFromData([
      '/api/files/serve/agent-generated-images%2Fworkflow%2Fuser%2Fimage.png',
    ])

    expect(images).toEqual([
      expect.objectContaining({
        url: '/api/files/serve/agent-generated-images%2Fworkflow%2Fuser%2Fimage.png',
        key: 'agent-generated-images/workflow/user/image.png',
        context: 'agent-generated-images',
      }),
    ])
  })

  it('normalizes absolute and relative serve URLs to the same storage key', () => {
    const relative = '/api/files/serve/agent-generated-images%2Fworkflow%2Fuser%2Fimage.png'
    const absolute =
      'https://app.example.com/api/files/serve/agent-generated-images%2Fworkflow%2Fuser%2Fimage.png'

    expect(normalizeImageUrlForCompare(relative)).toBe(
      'agent-generated-images/workflow/user/image.png'
    )
    expect(normalizeImageUrlForCompare(absolute)).toBe(
      'agent-generated-images/workflow/user/image.png'
    )
  })

  it('resolves selectable images from rendered URLs when metadata is missing', () => {
    const imageUrl =
      'https://app.example.com/api/files/serve/agent-generated-images%2Fworkflow%2Fuser%2Fimage.png'
    const resolved = resolveSelectableGeneratedImage(imageUrl, new Map())

    expect(resolved).toEqual(
      expect.objectContaining({
        url: imageUrl,
        key: 'agent-generated-images/workflow/user/image.png',
        context: 'agent-generated-images',
      })
    )
  })
})
