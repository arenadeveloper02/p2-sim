import { describe, expect, it } from 'vitest'
import { extractGeneratedImagesFromData } from '@/lib/chat/assistant-assets'

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
})
