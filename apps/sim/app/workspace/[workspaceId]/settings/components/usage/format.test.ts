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

describe('usage tool family rollup', () => {
  it('maps Exa operations to a single family id', () => {
    expect(resolveUsageToolFamilyId('exa_search')).toBe('exa')
    expect(resolveUsageToolFamilyId('exa_answer')).toBe('exa')
    expect(resolveUsageToolFamilyId('exa')).toBe('exa')
    expect(resolveUsageToolFamilyId('Exa Search')).toBe('exa')
    expect(resolveUsageToolFamilyId('EXA Competitor Research')).toBe('exa')
  })

  it('labels families and operations without pulling the block registry', () => {
    expect(formatToolLabel('exa_search')).toBe('Exa Search')
    expect(formatUsageToolFamilyLabel('exa')).toBe('Exa')
  })

  it('keeps non-Exa display titles as their own family', () => {
    expect(resolveUsageToolFamilyId('Competitor Research')).toBe('competitor_research')
    expect(resolveUsageToolFamilyId('My Custom Tool')).toBe('my_custom_tool')
  })

  it('preserves multi-segment families', () => {
    expect(resolveUsageToolFamilyId('browser_use_run_task')).toBe('browser_use')
    expect(resolveUsageToolFamilyId('google_maps_search')).toBe('google_maps')
  })

  it('aggregates costs and counts by family', () => {
    const merged = aggregateUsageToolsByFamily([
      { toolId: 'exa_search', billableCost: 1.5, count: 2 },
      { toolId: 'exa_answer', billableCost: 0.5, count: 1 },
      { toolId: 'Competitor Research', billableCost: 3, count: 4 },
    ])

    expect(merged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolId: 'exa', billableCost: 2, count: 3 }),
        expect.objectContaining({
          toolId: 'competitor_research',
          billableCost: 3,
          count: 4,
        }),
      ])
    )
    expect(merged).toHaveLength(2)
  })
})
