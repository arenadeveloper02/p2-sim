/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildModelPricingSnapshot,
  normalizeUsageEntry,
  normalizeUsageModelId,
  normalizeUsageToolId,
} from '@/lib/billing/core/usage-entry-normalize'

describe('normalizeUsageModelId', () => {
  it('resolves catalog casing and strips provider prefix', () => {
    expect(normalizeUsageModelId('anthropic/claude-opus-4-6')).toBe('claude-opus-4-6')
    expect(normalizeUsageModelId('GPT-4O')).toBe('gpt-4o')
  })
})

describe('normalizeUsageToolId', () => {
  it('strips workflow executor suffix', () => {
    expect(normalizeUsageToolId('workflow_executor_abc-123')).toBe('workflow_executor')
  })
})

describe('normalizeUsageEntry', () => {
  it('adds pricingSnapshot and canonical model id for model rows', () => {
    const entry = normalizeUsageEntry({
      category: 'model',
      source: 'workflow',
      description: 'GPT-4O',
      cost: 0.1,
    })

    expect(entry.description).toBe('gpt-4o')
    expect(entry.pricingSnapshot?.model).toBe('gpt-4o')
    expect(entry.pricingSnapshot?.multiplier).toBe(1)
    expect(entry.provider).toBe('openai')
  })

  it('normalizes tool id on tool rows', () => {
    const entry = normalizeUsageEntry({
      category: 'tool',
      source: 'workflow',
      description: 'knowledge_search_kb-1',
      cost: 0.05,
    })

    expect(entry.description).toBe('knowledge_search')
    expect(entry.toolId).toBe('knowledge_search')
  })
})

describe('buildModelPricingSnapshot', () => {
  it('captures rates from models.ts', () => {
    const snapshot = buildModelPricingSnapshot('gpt-4o', 1.5)
    expect(snapshot.model).toBe('gpt-4o')
    expect(snapshot.multiplier).toBe(1.5)
    expect(snapshot.inputRatePerMillion).toBeGreaterThan(0)
    expect(snapshot.pricingSource).toBe('models-ts')
  })
})
