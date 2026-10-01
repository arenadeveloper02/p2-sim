/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExecuteTool } = vi.hoisted(() => ({
  mockExecuteTool: vi.fn(),
}))

vi.mock('@/tools', () => ({
  executeTool: mockExecuteTool,
}))

import { runImageGenerationWrapper } from '@/lib/image-generation/run-wrapper.server'

const BASE_TOOLS = [
  ['openai_image', { model: 'gpt-image-1', prompt: 'a cat' }],
  ['google_imagen', { model: 'imagen-4.0-generate-001', prompt: 'a cat' }],
  ['google_nano_banana', { model: 'gemini-2.5-flash-image', prompt: 'a cat' }],
] as const

describe('runImageGenerationWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecuteTool.mockResolvedValue({
      success: true,
      output: { image: 'https://example.com/image.png' },
    })
  })

  it.each(BASE_TOOLS)(
    'executes %s even when no trusted context is supplied',
    async (baseToolId, params) => {
      const result = await runImageGenerationWrapper({
        baseToolId,
        params,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.output.image).toBe('https://example.com/image.png')
      }
      expect(mockExecuteTool).toHaveBeenCalledWith(baseToolId, expect.any(Object))
    }
  )

  it.each(BASE_TOOLS)('forwards trusted executeTool options to %s', async (baseToolId, params) => {
    const executionContext = {
      workflowId: 'wf-1',
      workspaceId: 'ws-1',
      executionId: 'ex-1',
      userId: 'user-1',
      metadata: {},
    }

    const result = await runImageGenerationWrapper(
      { baseToolId, params },
      { executionContext: executionContext as never }
    )

    expect(result.success).toBe(true)
    expect(mockExecuteTool).toHaveBeenCalledWith(
      baseToolId,
      expect.objectContaining({ prompt: 'a cat' }),
      { executionContext }
    )
  })
})
