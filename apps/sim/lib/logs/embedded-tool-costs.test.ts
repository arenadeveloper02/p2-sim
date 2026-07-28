/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest'
import {
  accumulateEmbeddedToolCosts,
  extractEmbeddedToolCostsFromSpan,
  extractToolOutputModel,
  formatEmbeddedToolLabel,
  mergeEmbeddedToolCosts,
  normalizeEmbeddedToolCosts,
  resolveEmbeddedToolCostKey,
  resolveEmbeddedToolsForModel,
  UNATTRIBUTED_AGENT_TOOLS_ID,
} from '@/lib/logs/embedded-tool-costs'

describe('embedded-tool-costs', () => {
  it('extracts image model from tool output fields', () => {
    expect(extractToolOutputModel({ model: 'gpt-image-1.5' })).toBe('gpt-image-1.5')
    expect(extractToolOutputModel({ cost: { model: 'flux-2-pro', total: 0.04 } })).toBe('flux-2-pro')
    expect(
      extractToolOutputModel({ metadata: { model: 'gemini-3.1-flash-image-preview' } })
    ).toBe('gemini-3.1-flash-image-preview')
  })

  it('resolves image_generate to the underlying model when present', () => {
    expect(
      resolveEmbeddedToolCostKey('image_generate', {
        model: 'gpt-image-1.5',
        cost: { total: 0.04 },
      })
    ).toBe('gpt-image-1.5')
    expect(resolveEmbeddedToolCostKey('image_generate', { cost: { total: 0.04 } })).toBe(
      'image_generate'
    )
    expect(resolveEmbeddedToolCostKey('exa_search', { model: 'gpt-image-1.5' })).toBe('exa_search')
  })

  it('normalizes per-tool costs to the parent toolCost subtotal', () => {
    expect(normalizeEmbeddedToolCosts({ firecrawl_scrape: 0.01, exa_search: 0.01 }, 0.03)).toEqual({
      firecrawl_scrape: 0.015,
      exa_search: 0.015,
    })
  })

  it('merges cumulative metadata with max per tool name', () => {
    expect(
      mergeEmbeddedToolCosts(
        { 'gpt-image-1.5': 0.04 },
        { 'gpt-image-1.5': 0.067, exa_search: 0.01 }
      )
    ).toEqual({
      'gpt-image-1.5': 0.067,
      exa_search: 0.01,
    })
  })

  it('accumulates per-tool costs across spans in one summary', () => {
    expect(accumulateEmbeddedToolCosts({ exa_search: 0.01 }, { exa_search: 0.02 })).toEqual({
      exa_search: 0.03,
    })
  })

  it('extracts embedded tool costs keyed by image model', () => {
    const costs = extractEmbeddedToolCostsFromSpan({
      type: 'agent',
      children: [
        {
          type: 'tool',
          name: 'image_generate',
          output: { model: 'gpt-image-1.5', cost: { total: 0.04 } },
        },
        {
          type: 'tool',
          name: 'exa_search',
          output: { cost: { total: 0.01 } },
        },
      ],
    })

    expect(costs).toEqual({
      'gpt-image-1.5': 0.04,
      exa_search: 0.01,
    })
  })

  it('places unresolved remainder under unattributed agent tools', () => {
    const resolved = resolveEmbeddedToolsForModel({
      model: 'gpt-5.5',
      toolCost: 0.05,
      embeddedToolCosts: { 'gpt-image-1.5': 0.03 },
    })

    expect(resolved.tools).toEqual([{ name: 'gpt-image-1.5', cost: 0.03 }])
    expect(resolved.unattributed).toBeCloseTo(0.02, 8)
  })

  it('falls back to unattributed when only aggregate toolCost exists', () => {
    const resolved = resolveEmbeddedToolsForModel({
      model: 'gpt-5.5',
      toolCost: 0.04,
    })

    expect(resolved.tools).toEqual([])
    expect(resolved.unattributed).toBe(0.04)
    expect(UNATTRIBUTED_AGENT_TOOLS_ID).toBe('unattributed_agent_tools')
  })

  it('upgrades legacy image_generate metadata from trace spans', () => {
    const resolved = resolveEmbeddedToolsForModel({
      model: 'gpt-5.5',
      toolCost: 0.04,
      embeddedToolCosts: { image_generate: 0.04 },
      traceSpans: [
        {
          id: 'agent',
          name: 'Agent',
          type: 'agent',
          model: 'gpt-5.5',
          children: [
            {
              id: 'tool-1',
              name: 'image_generate',
              type: 'tool',
              output: { model: 'gpt-image-1.5', cost: { total: 0.04 } },
            },
          ],
        },
      ],
    })

    expect(resolved.tools).toEqual([{ name: 'gpt-image-1.5', cost: 0.04 }])
    expect(resolved.unattributed).toBe(0)
  })

  it('normalizes trace fallback tool costs to the billable toolCost subtotal', () => {
    const resolved = resolveEmbeddedToolsForModel({
      model: 'gpt-5.5',
      toolCost: 0.06,
      traceSpans: [
        {
          id: 'agent',
          name: 'Agent',
          type: 'agent',
          model: 'gpt-5.5',
          children: [
            {
              id: 'tool-1',
              name: 'image_generate',
              type: 'tool',
              output: { model: 'gpt-image-1.5', cost: { total: 0.02 } },
            },
          ],
        },
      ],
    })

    expect(resolved.tools).toEqual([{ name: 'gpt-image-1.5', cost: 0.06 }])
    expect(resolved.unattributed).toBe(0)
  })

  it('formats image model ids verbatim', () => {
    expect(formatEmbeddedToolLabel('gpt-image-1.5')).toBe('gpt-image-1.5')
    expect(formatEmbeddedToolLabel('exa_search')).toBe('Exa Search')
  })
})
