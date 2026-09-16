/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest'
import {
  aggregateUsageToolsByFamily,
  formatToolLabel,
  formatUsageToolFamilyLabel,
  resolveUsageToolFamilyId,
} from '@/app/workspace/[workspaceId]/settings/components/usage/format'

describe('usage tool id normalization', () => {
  it('labels the mothership/copilot tool bucket as Copilot tools', () => {
    expect(formatUsageToolFamilyLabel('copilot')).toBe('Copilot tools')
    expect(formatToolLabel('copilot')).toBe('Copilot tools')
  })

  it('rolls registered service families from tool ids dynamically', () => {
    expect(resolveUsageToolFamilyId('exa_search')).toBe('exa')
    expect(resolveUsageToolFamilyId('exa_answer')).toBe('exa')
    expect(resolveUsageToolFamilyId('exa')).toBe('exa')
    expect(resolveUsageToolFamilyId('Exa Search')).toBe('exa')
    expect(resolveUsageToolFamilyId('exacomposesearch')).toBe('exa')
    expect(resolveUsageToolFamilyId('exaindnewssearch')).toBe('exa')
    expect(resolveUsageToolFamilyId('firecrawl_scrape')).toBe('firecrawl')
    expect(resolveUsageToolFamilyId('firecrawl')).toBe('firecrawl')
    expect(resolveUsageToolFamilyId('google_ads_v1_query')).toBe('google_ads')
    expect(resolveUsageToolFamilyId('facebook_ads_query')).toBe('facebook_ads_query')
  })

  it('strips trailing resource ids before family rollup', () => {
    expect(
      resolveUsageToolFamilyId('knowledge_search_ecc75653-ff03-4178-82e3-9d2a284c6804')
    ).toBe('knowledge')
    expect(resolveUsageToolFamilyId('Competitor Research')).toBe('competitor_research')
  })

  it('labels tools without pulling the block registry', () => {
    expect(formatToolLabel('exa_search')).toBe('Exa Search')
    expect(formatUsageToolFamilyLabel('exa')).toBe('Exa')
    expect(formatUsageToolFamilyLabel('firecrawl')).toBe('Firecrawl')
    expect(formatUsageToolFamilyLabel('google_ads')).toBe('Google Ads')
    expect(formatUsageToolFamilyLabel('knowledge')).toBe('Knowledge')
  })

  it('aggregates costs after dynamic family rollup', () => {
    const merged = aggregateUsageToolsByFamily([
      { toolId: 'exa_search', billableCost: 1.5, count: 2 },
      { toolId: 'exa_answer', billableCost: 0.5, count: 1 },
      { toolId: 'exacomposesearch', billableCost: 0.1, count: 3 },
      { toolId: 'exaindnewssearch', billableCost: 0.05, count: 2 },
      { toolId: 'firecrawl_scrape', billableCost: 0.01, count: 7 },
      { toolId: 'firecrawl', billableCost: 0.002, count: 3 },
      {
        toolId: 'knowledge_search_ecc75653-ff03-4178-82e3-9d2a284c6804',
        billableCost: 0.000001,
        count: 1,
      },
      {
        toolId: 'knowledge_upload_chunk_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        billableCost: 0.000002,
        count: 2,
      },
      { toolId: 'google_ads_v1_query', billableCost: 0.1, count: 3 },
      { toolId: 'google_ads_v1_mutate', billableCost: 0.05, count: 1 },
      { toolId: 'zero_cost_tool', billableCost: 0, count: 12 },
    ])

    expect(merged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolId: 'exa', billableCost: 2.15, count: 8 }),
        expect.objectContaining({ toolId: 'firecrawl', billableCost: 0.012, count: 10 }),
        expect.objectContaining({ toolId: 'knowledge', billableCost: 0.000003, count: 3 }),
        expect.objectContaining({ toolId: 'google_ads', billableCost: 0.15, count: 4 }),
      ])
    )
    expect(merged).toHaveLength(4)
    expect(merged.some((row) => row.toolId === 'zero_cost_tool')).toBe(false)
  })
})
