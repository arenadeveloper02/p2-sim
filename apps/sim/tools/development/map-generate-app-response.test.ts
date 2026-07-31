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

vi.mock('@/lib/development/format-generated-app-build-errors', () => ({
  formatBuildErrorsSummary: vi.fn(() => ''),
}))

import { mapGenerateAppResultToToolResponse } from '@/tools/development/map-generate-app-response'

describe('mapGenerateAppResultToToolResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildToolLlmCostFromModelUsage.mockReturnValue({
      cost: { input: 0.01, output: 0.02, total: 0.03 },
      model: 'gpt-4o',
      tokens: { input: 100, output: 50, total: 150 },
      llmUsage: { 'gpt-4o': { inputTokens: 100, outputTokens: 50 } },
    })
  })

  it('lifts precomputed cost onto tool output', () => {
    const result = mapGenerateAppResultToToolResponse({
      success: true,
      appName: 'Demo',
      fileCount: 3,
      cost: { input: 1, output: 2, total: 3 },
      model: 'claude-opus-4-8',
      tokens: { input: 10, output: 20, total: 30 },
      llmUsage: { 'claude-opus-4-8': { inputTokens: 10, outputTokens: 20 } },
    })

    expect(result.success).toBe(true)
    expect(result.output.cost).toEqual({ input: 1, output: 2, total: 3 })
    expect(result.output.model).toBe('claude-opus-4-8')
    expect(result.output.tokens).toEqual({ input: 10, output: 20, total: 30 })
    expect(result.output.llmUsage).toEqual({
      'claude-opus-4-8': { inputTokens: 10, outputTokens: 20 },
    })
    expect(mockBuildToolLlmCostFromModelUsage).not.toHaveBeenCalled()
  })

  it('derives cost from llmUsage when API did not precompute', () => {
    const result = mapGenerateAppResultToToolResponse({
      success: true,
      appName: 'Demo',
      fileCount: 1,
      llmUsage: { 'gpt-4o': { inputTokens: 100, outputTokens: 50 } },
    })

    expect(mockBuildToolLlmCostFromModelUsage).toHaveBeenCalled()
    expect(result.output.cost?.total).toBe(0.03)
    expect(result.output.llmUsage).toEqual({
      'gpt-4o': { inputTokens: 100, outputTokens: 50 },
    })
  })
})
