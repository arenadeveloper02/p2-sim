/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockBuildToolLlmCostFromModelUsage } = vi.hoisted(() => ({
  mockBuildToolLlmCostFromModelUsage: vi.fn(),
}))

vi.mock('@/lib/billing/core/tool-llm-cost', () => ({
  buildToolLlmCostFromModelUsage: mockBuildToolLlmCostFromModelUsage,
}))

import { mapAgentFrontResultToToolResponse } from '@/tools/agent-front/map-response'

describe('mapAgentFrontResultToToolResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildToolLlmCostFromModelUsage.mockReturnValue(undefined)
  })

  it('maps success payloads', () => {
    const result = mapAgentFrontResultToToolResponse({
      success: true,
      content: 'ok',
      appName: 'Demo',
      repoName: 'demo',
      description: 'desc',
      features: ['a'],
      outputPath: 'generated-apps/demo',
      absoluteOutputPath: '/tmp/demo',
      fileCount: 10,
      uiMode: 'form',
      combineMode: 'parallel',
      apiCount: 2,
      apis: [{ name: 'A', slug: 'a', wired: true }],
      previewHtml: '<html></html>',
      previewPath: 'generated-apps/demo/preview.html',
    })

    expect(result.success).toBe(true)
    expect(result.output.appName).toBe('Demo')
    expect(result.output.apiCount).toBe(2)
    expect(result.output.previewHtml).toBe('<html></html>')
  })

  it('maps failure payloads', () => {
    const result = mapAgentFrontResultToToolResponse({
      success: false,
      error: 'boom',
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe('boom')
    expect(result.output.content).toBe('boom')
  })
})
