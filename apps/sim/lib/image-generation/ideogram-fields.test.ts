/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { evaluateSubBlockCondition } from '@/lib/workflows/subblocks/visibility'
import {
  buildIdeogramToolParams,
  IDEOGRAM_IMAGE_GENERATOR_SUB_BLOCKS,
  IDEOGRAM_OPERATION_OPTIONS,
  isIdeogramTransparentGenerate,
  resolveIdeogramToolId,
} from '@/lib/image-generation/ideogram-fields'

describe('IDEOGRAM_OPERATION_OPTIONS', () => {
  it('lists only picker models', () => {
    expect(IDEOGRAM_OPERATION_OPTIONS.map((option) => option.id)).toEqual([
      'generate_v4',
      'remix_v4',
      'inpaint_v3',
    ])
  })
})

describe('isIdeogramTransparentGenerate', () => {
  it('is true when Generate 4.0 has Transparent on', () => {
    expect(
      isIdeogramTransparentGenerate({
        model: 'generate_v4',
        transparentBackground: true,
      })
    ).toBe(true)
  })

  it('is false when Generate 4.0 has Transparent off', () => {
    expect(
      isIdeogramTransparentGenerate({
        model: 'generate_v4',
        transparentBackground: false,
      })
    ).toBe(false)
  })

  it('is true for legacy generate_transparent_v3', () => {
    expect(isIdeogramTransparentGenerate({ model: 'generate_transparent_v3' })).toBe(true)
  })
})

describe('resolveIdeogramToolId', () => {
  it('routes Generate 4.0 to ideogram_generate_v4', () => {
    expect(
      resolveIdeogramToolId({
        provider: 'ideogram',
        model: 'generate_v4',
        textPrompt: 'A cat',
      })
    ).toBe('ideogram_generate_v4')
  })

  it('routes Generate 4.0 + Transparent to ideogram_generate_transparent_v3', () => {
    expect(
      resolveIdeogramToolId({
        provider: 'ideogram',
        model: 'generate_v4',
        transparentBackground: true,
        textPrompt: 'A sticker',
      })
    ).toBe('ideogram_generate_transparent_v3')
  })

  it('still routes legacy generate_transparent_v3 and edit', () => {
    expect(
      resolveIdeogramToolId({
        provider: 'ideogram',
        model: 'generate_transparent_v3',
        ideogramPrompt: 'A sticker',
      })
    ).toBe('ideogram_generate_transparent_v3')
    expect(
      resolveIdeogramToolId({
        provider: 'ideogram',
        model: 'edit',
        ideogramPrompt: 'Add a hat',
      })
    ).toBe('ideogram_edit')
  })
})

describe('buildIdeogramToolParams', () => {
  it('maps textPrompt to prompt and omits Magic Prompt fields when Transparent is on', () => {
    const params = buildIdeogramToolParams({
      provider: 'ideogram',
      model: 'generate_v4',
      transparentBackground: true,
      textPrompt: 'A glossy icon',
      useMagicPrompt: true,
      jsonPrompt: { high_level_description: 'ignored' },
      resolutionV4: '2048x2048',
      enableCopyrightDetection: true,
      upscaleFactor: 'X2',
      ideogramAspectRatio: '1x1',
    })

    expect(params).toMatchObject({
      prompt: 'A glossy icon',
      upscaleFactor: 'X2',
      aspectRatio: '1x1',
    })
    expect(params).not.toHaveProperty('textPrompt')
    expect(params).not.toHaveProperty('useMagicPrompt')
    expect(params).not.toHaveProperty('jsonPrompt')
    expect(params).not.toHaveProperty('resolution')
    expect(params).not.toHaveProperty('enableCopyrightDetection')
  })

  it('keeps V4 Magic Prompt fields when Transparent is off', () => {
    const params = buildIdeogramToolParams({
      provider: 'ideogram',
      model: 'generate_v4',
      textPrompt: 'A poster',
      useMagicPrompt: true,
      resolutionV4: '2048x2048',
    })

    expect(params).toMatchObject({
      textPrompt: 'A poster',
      useMagicPrompt: true,
      resolution: '2048x2048',
    })
    expect(params).not.toHaveProperty('prompt')
  })
})

describe('IDEOGRAM_IMAGE_GENERATOR_SUB_BLOCKS visibility', () => {
  function findSubBlock(id: string) {
    const subBlock = IDEOGRAM_IMAGE_GENERATOR_SUB_BLOCKS.find((block) => block.id === id)
    if (!subBlock) throw new Error(`Missing subBlock ${id}`)
    return subBlock
  }

  it('hides Magic Prompt and JSON Prompt when Transparent is on', () => {
    const values = {
      provider: 'ideogram',
      model: 'generate_v4',
      transparentBackground: true,
    }
    expect(evaluateSubBlockCondition(findSubBlock('useMagicPrompt').condition, values)).toBe(
      false
    )
    expect(evaluateSubBlockCondition(findSubBlock('jsonPrompt').condition, values)).toBe(false)
    expect(
      evaluateSubBlockCondition(findSubBlock('transparentBackground').condition, values)
    ).toBe(true)
  })

  it('shows Magic Prompt when Transparent is off', () => {
    const values = {
      provider: 'ideogram',
      model: 'generate_v4',
      transparentBackground: false,
    }
    expect(evaluateSubBlockCondition(findSubBlock('useMagicPrompt').condition, values)).toBe(true)
  })

  it('shows aspect ratio and upscale when Transparent is on', () => {
    const values = {
      provider: 'ideogram',
      model: 'generate_v4',
      transparentBackground: true,
    }
    expect(evaluateSubBlockCondition(findSubBlock('ideogramAspectRatio').condition, values)).toBe(
      true
    )
    expect(evaluateSubBlockCondition(findSubBlock('upscaleFactor').condition, values)).toBe(true)
    expect(evaluateSubBlockCondition(findSubBlock('resolutionV4').condition, values)).toBe(false)
  })

  it('does not expose Edit-only subBlocks', () => {
    const ids = new Set(IDEOGRAM_IMAGE_GENERATOR_SUB_BLOCKS.map((block) => block.id))
    expect(ids.has('uploadImages')).toBe(false)
    expect(ids.has('editImageUrl')).toBe(false)
    expect(ids.has('imagesRef')).toBe(false)
  })
})
