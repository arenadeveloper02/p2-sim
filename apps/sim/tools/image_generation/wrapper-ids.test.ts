/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  getImageGenerationWrapperBaseToolId,
  IMAGE_GENERATION_WRAPPER_TOOL_IDS,
} from '@/tools/image_generation/wrapper-ids'

describe('image generation wrapper ids', () => {
  it('maps v2 wrapper tool ids to their base execution tools', () => {
    expect(IMAGE_GENERATION_WRAPPER_TOOL_IDS.openai_image_v2).toBe('openai_image')
    expect(IMAGE_GENERATION_WRAPPER_TOOL_IDS.google_imagen_v2).toBe('google_imagen')
    expect(IMAGE_GENERATION_WRAPPER_TOOL_IDS.google_nano_banana_v2).toBe('google_nano_banana')
  })

  it('resolves known wrapper ids and returns undefined for unknown ids', () => {
    expect(getImageGenerationWrapperBaseToolId('openai_image_v2')).toBe('openai_image')
    expect(getImageGenerationWrapperBaseToolId('unknown_tool')).toBeUndefined()
  })
})
