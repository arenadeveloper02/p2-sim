/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ImageGeneratorV2Block } from '@/blocks/blocks/image_generator'
import { AGENT_TOOL_BLOCK_TYPES } from '@/blocks/utils'
import { createLLMToolSchema } from '@/tools/params'
import { imageGenerateTool } from '@/tools/image/generate'

describe('ImageGeneratorV2Block', () => {
  it('is eligible as an agent tool', () => {
    expect(AGENT_TOOL_BLOCK_TYPES.has('image_generator_v2')).toBe(true)
  })

  it('resolves to image_generate for agent execution', () => {
    expect(ImageGeneratorV2Block.tools?.access).toEqual(['image_generate'])
    expect(ImageGeneratorV2Block.tools?.config.tool?.({})).toBe('image_generate')
  })

  it('exposes unset image_generate params to the agent except apiKey', async () => {
    const { schema } = await createLLMToolSchema(imageGenerateTool, {})

    expect(schema.properties).toHaveProperty('provider')
    expect(schema.properties).toHaveProperty('model')
    expect(schema.properties).toHaveProperty('prompt')
    expect(schema.properties).toHaveProperty('aspectRatio')
    expect(schema.properties).not.toHaveProperty('apiKey')
    expect(schema.required).toEqual(expect.arrayContaining(['prompt']))
    expect(schema.required).not.toEqual(expect.arrayContaining(['provider', 'model']))
  })

  it('uses combobox for provider, model, aspect ratio, and resolution fields', () => {
    const comboboxIds = new Set(['provider', 'model', 'aspectRatio', 'resolution'])
    const comboboxSubBlocks = ImageGeneratorV2Block.subBlocks.filter(
      (subBlock) => comboboxIds.has(subBlock.id) && subBlock.type === 'combobox'
    )

    expect(comboboxSubBlocks.length).toBeGreaterThan(0)
    expect(
      comboboxSubBlocks.every(
        (subBlock) => typeof subBlock.placeholder === 'string' && subBlock.placeholder.length > 0
      )
    ).toBe(true)
  })

  it('hides preconfigured image_generate params from the agent schema', async () => {
    const { schema } = await createLLMToolSchema(imageGenerateTool, {
      provider: 'openai',
      model: 'gpt-image-2',
      quality: 'high',
    })

    expect(schema.properties).not.toHaveProperty('provider')
    expect(schema.properties).not.toHaveProperty('model')
    expect(schema.properties).not.toHaveProperty('quality')
    expect(schema.properties).toHaveProperty('prompt')
  })

  const referenceFileA = {
    id: 'file-a',
    name: 'a.png',
    url: 'https://example.com/a.png',
    type: 'image/png',
  }

  const referenceFileB = {
    id: 'file-b',
    name: 'b.png',
    url: 'https://example.com/b.png',
    type: 'image/png',
  }

  it('defaults to GPT Image 2 for OpenAI and Nano Banana Pro for Gemini when model is omitted', () => {
    const openAIParams = ImageGeneratorV2Block.tools.config.params?.({
      provider: 'openai',
      prompt: 'A red car',
    })
    const geminiParams = ImageGeneratorV2Block.tools.config.params?.({
      provider: 'gemini',
      prompt: 'A blue car',
    })

    expect(openAIParams?.model).toBe('gpt-image-2')
    expect(geminiParams?.model).toBe('gemini-3-pro-image-preview')
  })

  it('maps multiple Gemini reference uploads to inputImages for Nano Banana 2', () => {
    const params = ImageGeneratorV2Block.tools.config.params?.({
      provider: 'gemini',
      model: 'gemini-3.1-flash-image-preview',
      prompt: 'Fuse these images',
      inputImage: [referenceFileA, referenceFileB],
    })

    expect(params?.inputImages).toHaveLength(2)
    expect(params?.inputImage).toBeUndefined()
  })

  it('maps multiple Gemini reference uploads to inputImages for Nano Banana Pro', () => {
    const params = ImageGeneratorV2Block.tools.config.params?.({
      provider: 'gemini',
      model: 'gemini-3-pro-image-preview',
      prompt: 'Fuse these images',
      inputImage: [referenceFileA, referenceFileB],
    })

    expect(params?.inputImages).toHaveLength(2)
    expect(params?.inputImage).toBeUndefined()
  })

  it('maps multiple Gemini reference uploads to inputImages for Nano Banana', () => {
    const params = ImageGeneratorV2Block.tools.config.params?.({
      provider: 'gemini',
      model: 'gemini-2.5-flash-image',
      prompt: 'Fuse these images',
      inputImage: [referenceFileA, referenceFileB],
    })

    expect(params?.inputImages).toHaveLength(2)
    expect(params?.inputImage).toBeUndefined()
  })

  it('maps multiple OpenAI reference uploads to a single inputImage', () => {
    const params = ImageGeneratorV2Block.tools.config.params?.({
      provider: 'openai',
      model: 'gpt-image-2',
      prompt: 'Edit this image',
      inputImage: [referenceFileA, referenceFileB],
    })

    expect(params?.inputImage).toEqual(referenceFileB)
    expect(params?.inputImages).toBeUndefined()
    expect(params?.inputImageWarning).toBeDefined()
  })

  it.skip('preserves multiple uploaded references for Fal.ai Nano Banana 2', () => {
    const params = ImageGeneratorV2Block.tools.config.params?.({
      provider: 'falai',
      model: 'nano-banana-2',
      prompt: 'Edit these product images',
      inputImage: [
        {
          id: 'file-1',
          name: 'source-a.png',
          url: 'https://example.com/source-a.png',
          key: 'execution/ws/wf/ex/source-a.png',
          type: 'image/png',
          size: 123,
        },
        {
          id: 'file-2',
          name: 'source-b.png',
          url: 'https://example.com/source-b.png',
          key: 'execution/ws/wf/ex/source-b.png',
          type: 'image/png',
          size: 456,
        },
      ],
    })

    expect(params).toMatchObject({
      provider: 'falai',
      model: 'nano-banana-2',
      prompt: 'Edit these product images',
    })
    expect(params?.inputImages).toHaveLength(2)
  })
})
