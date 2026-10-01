/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest'
import {
  aggregateUsageToolsByFamily,
  formatUsageToolFamilyLabel,
  resolveUsageToolFamilyId,
} from '@/app/workspace/[workspaceId]/settings/components/usage/format'

describe('usage tool family rollup', () => {
  it('maps Exa operations to a single family id', () => {
    expect(resolveUsageToolFamilyId('exa_search')).toBe('exa')
    expect(resolveUsageToolFamilyId('exa_answer')).toBe('exa')
    expect(resolveUsageToolFamilyId('exa')).toBe('exa')
  })

  it('keeps multi-segment families intact', () => {
    expect(resolveUsageToolFamilyId('browser_use_run_task')).toBe('browser_use')
    expect(resolveUsageToolFamilyId('google_maps_search')).toBe('google_maps')
  })

  it('aggregates Exa Search + Exa Answer into one Exa row', () => {
    const rows = aggregateUsageToolsByFamily([
      { toolId: 'exa_search', billableCost: 0.07, rawCost: 0.07, count: 1 },
      { toolId: 'exa_answer', billableCost: 0.055, rawCost: 0.055, count: 2 },
      { toolId: 'firecrawl_scrape', billableCost: 0.01, rawCost: 0.01, count: 1 },
    ])

    expect(rows).toEqual([
      {
        toolId: 'exa',
        billableCost: 0.125,
        rawCost: 0.125,
        count: 3,
      },
      {
        toolId: 'firecrawl',
        billableCost: 0.01,
        rawCost: 0.01,
        count: 1,
      },
    ])
    expect(formatUsageToolFamilyLabel('exa')).toBe('Exa')
  })

  it('drops tools that display as 0 credits', () => {
    const rows = aggregateUsageToolsByFamily([
      { toolId: 'knowledge_search', billableCost: 0, count: 12 },
      { toolId: 'firecrawl_scrape', billableCost: 0.001, count: 2 },
      { toolId: 'exa_search', billableCost: 0.07, count: 1 },
    ])

    expect(rows.map((row) => row.toolId)).toEqual(['exa'])
  })
})
