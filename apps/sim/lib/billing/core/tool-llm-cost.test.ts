/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetCostMultiplier, mockCalculateCost } = vi.hoisted(() => ({
  mockGetCostMultiplier: vi.fn(() => 1),
  mockCalculateCost: vi.fn(
    (_model: string, inputTokens: number, outputTokens: number, _cached?: boolean, mult = 1) => ({
      input: (inputTokens / 1_000_000) * 1 * mult,
      output: (outputTokens / 1_000_000) * 5 * mult,
      total: ((inputTokens / 1_000_000) * 1 + (outputTokens / 1_000_000) * 5) * mult,
      pricing: { input: 1, output: 5, updatedAt: '2026-01-01' },
    })
  ),
}))

vi.mock('@/lib/core/config/env-flags', () => ({
  getCostMultiplier: mockGetCostMultiplier,
}))

vi.mock('@/providers/utils', () => ({
  calculateCost: mockCalculateCost,
}))

import {
  buildToolLlmCostFields,
  buildToolLlmCostFromModelUsage,
  extractProviderToolCostFields,
} from '@/lib/billing/core/tool-llm-cost'

describe('tool-llm-cost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCostMultiplier.mockReturnValue(1)
  })

  describe('buildToolLlmCostFields', () => {
    it('returns undefined for fallback or zero tokens', () => {
      expect(buildToolLlmCostFields('fallback', 10, 5)).toBeUndefined()
      expect(buildToolLlmCostFields('claude-opus-4-8', 0, 0)).toBeUndefined()
    })

    it('applies cost multiplier via calculateCost', () => {
      mockGetCostMultiplier.mockReturnValue(2)
      const fields = buildToolLlmCostFields('claude-opus-4-8', 1000, 500)
      expect(fields).toBeDefined()
      expect(mockCalculateCost).toHaveBeenCalledWith('claude-opus-4-8', 1000, 500, false, 2, 2)
      expect(fields?.tokens).toEqual({ input: 1000, output: 500, total: 1500 })
      expect(fields?.model).toBe('claude-opus-4-8')
    })
  })

  describe('buildToolLlmCostFromModelUsage', () => {
    it('sums costs across models and keeps llmUsage', () => {
      const usage = {
        'model-a': { inputTokens: 100, outputTokens: 50 },
        'model-b': { inputTokens: 200, outputTokens: 100 },
      }
      const fields = buildToolLlmCostFromModelUsage(usage)
      expect(fields?.llmUsage).toEqual(usage)
      expect(fields?.tokens).toEqual({ input: 300, output: 150, total: 450 })
      expect(fields?.model).toBe('model-a,model-b')
      expect(fields?.cost.total).toBeGreaterThan(0)
    })

    it('returns undefined for empty usage', () => {
      expect(buildToolLlmCostFromModelUsage(undefined)).toBeUndefined()
      expect(buildToolLlmCostFromModelUsage({})).toBeUndefined()
    })
  })

  describe('extractProviderToolCostFields', () => {
    it('lifts cost, tokens, and model from provider response', () => {
      const fields = extractProviderToolCostFields({
        content: 'ok',
        model: 'gpt-4o',
        tokens: { input: 10, output: 20, total: 30 },
        cost: { input: 0.01, output: 0.02, total: 0.03, pricing: { input: 1, output: 2, updatedAt: '' } },
      })
      expect(fields).toEqual({
        model: 'gpt-4o',
        tokens: { input: 10, output: 20, total: 30 },
        cost: { input: 0.01, output: 0.02, total: 0.03 },
      })
    })

    it('returns undefined for non-objects', () => {
      expect(extractProviderToolCostFields(null)).toBeUndefined()
      expect(extractProviderToolCostFields('string')).toBeUndefined()
    })
  })
})
