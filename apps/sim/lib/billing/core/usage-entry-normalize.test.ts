/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildExternalPricingSnapshot,
  buildModelPricingSnapshot,
  buildToolPricingSnapshot,
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
    expect(entry.pricingSnapshot?.tool).toBe('knowledge_search')
    expect(entry.pricingSnapshot?.pricingSource).toBe('hosted-key')
  })

  it('adds external pricing snapshot with passthrough multiplier', () => {
    const entry = normalizeUsageEntry({
      category: 'external',
      source: 'workflow',
      description: 'vendor_spend',
      cost: 12.5,
      vendor: 'Acme',
    })

    expect(entry.pricingSnapshot?.vendor).toBe('Acme')
    expect(entry.pricingSnapshot?.multiplier).toBe(1)
    expect(entry.pricingSnapshot?.pricingSource).toBe('vendor-pricing')
  })

  it('captures rerank flat rate in model pricing snapshot', () => {
    const entry = normalizeUsageEntry({
      category: 'model',
      source: 'knowledge-base',
      description: 'rerank-v4.0-pro',
      cost: 0.0025,
    })

    expect(entry.pricingSnapshot?.flatRate).toBe(0.0025)
    expect(entry.pricingSnapshot?.model).toBe('rerank-v4.0-pro')
  })
})

describe('buildToolPricingSnapshot', () => {
  it('captures hosted-key source', () => {
    const snapshot = buildToolPricingSnapshot('firecrawl_scrape', 1.5)
    expect(snapshot.tool).toBe('firecrawl_scrape')
    expect(snapshot.multiplier).toBe(1.5)
    expect(snapshot.pricingSource).toBe('hosted-key')
  })
})

describe('buildExternalPricingSnapshot', () => {
  it('uses multiplier 1 for COGS passthrough', () => {
    const snapshot = buildExternalPricingSnapshot('Stripe')
    expect(snapshot.vendor).toBe('Stripe')
    expect(snapshot.multiplier).toBe(1)
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
