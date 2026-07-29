/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ideogramPostProcessBodySchema } from '@/lib/api/contracts/tools/ideogram'
import {
  coercePostProcessorImageInput,
  resolvePostProcessorToolId,
} from '@/lib/image-generation/ideogram-post-processor-fields'
import {
  getIdeogramPostProcessRawCost,
  IDEOGRAM_POST_PROCESS_RAW_COST_USD,
} from '@/lib/image-generation/ideogram-post-process-pricing'

describe('coercePostProcessorImageInput', () => {
  it('coerces an internal serve URL into a FileInput-shaped object', () => {
    const url =
      '/api/files/serve/agent-generated-images/wf-1/user-1/out.png'
    expect(coercePostProcessorImageInput(url)).toEqual({
      url,
      name: 'out.png',
      size: 0,
      key: 'agent-generated-images/wf-1/user-1/out.png',
    })
  })

  it('leaves JSON file-object strings unchanged for normalizeFileInput', () => {
    const json = JSON.stringify({ name: 'a.png', size: 10, key: 'uploads/a.png' })
    expect(coercePostProcessorImageInput(json)).toBe(json)
  })

  it('leaves external URLs unchanged', () => {
    const url = 'https://cdn.example.com/image.png'
    expect(coercePostProcessorImageInput(url)).toBe(url)
  })
})

describe('resolvePostProcessorToolId', () => {
  it('accepts an internal URL string as the image param', () => {
    const params: Record<string, unknown> = {
      operation: 'remove_background',
      imageRef: '/api/files/serve/agent-generated-images/wf-1/user-1/out.png',
    }
    expect(resolvePostProcessorToolId(params)).toBe('ideogram_remove_background')
    expect(params.image).toMatchObject({
      name: 'out.png',
      key: 'agent-generated-images/wf-1/user-1/out.png',
    })
  })

  it('accepts an external URL string as imageUrl', () => {
    const params: Record<string, unknown> = {
      operation: 'upscale',
      imageRef: 'https://cdn.example.com/photo.png',
    }
    expect(resolvePostProcessorToolId(params)).toBe('ideogram_upscale')
    expect(params.image).toBeUndefined()
    expect(params.imageUrl).toBe('https://cdn.example.com/photo.png')
  })

  it('accepts a dedicated imageUrl field', () => {
    const params: Record<string, unknown> = {
      operation: 'describe_v4',
      imageUrl: 'https://cdn.example.com/other.png',
    }
    expect(resolvePostProcessorToolId(params)).toBe('ideogram_describe_v4')
    expect(params.imageUrl).toBe('https://cdn.example.com/other.png')
  })
})

describe('ideogramPostProcessBodySchema reframe resolution', () => {
  it('accepts a valid ResolutionV3 value', () => {
    const parsed = ideogramPostProcessBodySchema.safeParse({
      operation: 'reframe_v3',
      imageUrl: '/api/files/serve/agent-generated-images/wf/u/a.png',
      resolution: '1024x1024',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects Ideogram v4 sizes like 1440x2560', () => {
    const parsed = ideogramPostProcessBodySchema.safeParse({
      operation: 'reframe_v3',
      imageUrl: '/api/files/serve/agent-generated-images/wf/u/a.png',
      resolution: '1440x2560',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('getIdeogramPostProcessRawCost', () => {
  it('returns hosted COGS for each operation', () => {
    expect(getIdeogramPostProcessRawCost('upscale')).toBe(
      IDEOGRAM_POST_PROCESS_RAW_COST_USD.upscale
    )
  })

  it('returns 0 for BYOK', () => {
    expect(getIdeogramPostProcessRawCost('reframe_v3', { byok: true })).toBe(0)
  })
})
