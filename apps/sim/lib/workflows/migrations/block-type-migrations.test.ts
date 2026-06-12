/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { BlockState } from '@/stores/workflows/workflow/types'
import { migrateBlockTypes } from '@/lib/workflows/migrations/block-type-migrations'

function makeBlock(overrides: Partial<BlockState> & { type: string }): BlockState {
  return {
    id: 'block-1',
    name: 'Image Generator',
    position: { x: 0, y: 0 },
    subBlocks: {},
    outputs: {},
    enabled: true,
    ...overrides,
  } as BlockState
}

describe('migrateBlockTypes', () => {
  it('should migrate legacy image_generator blocks to image_generator_v2', () => {
    const input: Record<string, BlockState> = {
      b1: makeBlock({
        type: 'image_generator',
        subBlocks: {
          model: { id: 'model', type: 'dropdown', value: 'dall-e-3' },
          prompt: { id: 'prompt', type: 'long-input', value: 'A sunset' },
        },
      }),
    }

    const { blocks, migrated } = migrateBlockTypes(input)

    expect(migrated).toBe(true)
    expect(blocks.b1.type).toBe('image_generator_v2')
    expect(blocks.b1.subBlocks.provider?.value).toBe('openai')
    expect(blocks.b1.subBlocks.model?.value).toBe('gpt-image-1.5')
    expect(blocks.b1.subBlocks.prompt?.value).toBe('A sunset')
  })

  it('should map gemini models to gemini provider and copy imageSize to resolution', () => {
    const input: Record<string, BlockState> = {
      b1: makeBlock({
        type: 'image_generator',
        subBlocks: {
          model: { id: 'model', type: 'dropdown', value: 'gemini-3-pro-image-preview' },
          imageSize: { id: 'imageSize', type: 'dropdown', value: '2K' },
        },
      }),
    }

    const { blocks } = migrateBlockTypes(input)

    expect(blocks.b1.subBlocks.provider?.value).toBe('gemini')
    expect(blocks.b1.subBlocks.model?.value).toBe('gemini-3-pro-image-preview')
    expect(blocks.b1.subBlocks.resolution?.value).toBe('2K')
  })

  it('should leave non-legacy blocks unchanged', () => {
    const input: Record<string, BlockState> = {
      b1: makeBlock({ type: 'agent' }),
    }

    const { blocks, migrated } = migrateBlockTypes(input)

    expect(migrated).toBe(false)
    expect(blocks.b1.type).toBe('agent')
  })
})
