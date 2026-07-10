/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest'
import {
  accumulateEmbeddedToolCosts,
  extractEmbeddedToolCostsFromSpan,
  mergeEmbeddedToolCosts,
  normalizeEmbeddedToolCosts,
  resolveEmbeddedToolsForModel,
  UNATTRIBUTED_AGENT_TOOLS_ID,
} from '@/lib/logs/embedded-tool-costs'

describe('embedded-tool-costs', () => {
  it('normalizes per-tool costs to the parent toolCost subtotal', () => {
    expect(normalizeEmbeddedToolCosts({ firecrawl_scrape: 0.01, exa_search: 0.01 }, 0.03)).toEqual({
      firecrawl_scrape: 0.015,
      exa_search: 0.015,
    })
  })

  it('merges cumulative metadata with max per tool name', () => {
    expect(
      mergeEmbeddedToolCosts({ image_generate: 0.04 }, { image_generate: 0.067, exa_search: 0.01 })
    ).toEqual({
      image_generate: 0.067,
      exa_search: 0.01,
    })
  })

  it('accumulates per-tool costs across spans in one summary', () => {
    expect(accumulateEmbeddedToolCosts({ exa_search: 0.01 }, { exa_search: 0.02 })).toEqual({
      exa_search: 0.03,
    })
  })

  it('extracts embedded tool costs from agent child spans', () => {
    const costs = extractEmbeddedToolCostsFromSpan({
      type: 'agent',
      children: [
        {
          type: 'tool',
          name: 'image_generate',
          output: { cost: { total: 0.04 } },
        },
        {
          type: 'tool',
          name: 'exa_search',
          output: { cost: { total: 0.01 } },
        },
      ],
    })

    expect(costs).toEqual({
      image_generate: 0.04,
      exa_search: 0.01,
    })
  })

  it('places unresolved remainder under unattributed agent tools', () => {
    const resolved = resolveEmbeddedToolsForModel({
      model: 'gpt-5.5',
      toolCost: 0.05,
      embeddedToolCosts: { image_generate: 0.03 },
    })

    expect(resolved.tools).toEqual([{ name: 'image_generate', cost: 0.03 }])
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
})
