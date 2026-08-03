/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { resolveDateRange, resolveUsageLogSources } from '@/app/api/users/me/usage-logs/shared'

describe('resolveDateRange', () => {
  it('throws when period is "custom" without a startDate', () => {
    expect(() => resolveDateRange('custom', undefined, undefined)).toThrow(
      'startDate is required when period is "custom"'
    )
  })

  it('defaults endDate to now when omitted for a custom period', () => {
    const range = resolveDateRange('custom', '2026-01-01T00:00', undefined)

    expect(range.startDate).toEqual(new Date('2026-01-01T00:00'))
    expect(range.endDate.getTime()).toBeCloseTo(Date.now(), -3)
  })

  it('uses both bounds when provided for a custom period', () => {
    const range = resolveDateRange('custom', '2026-01-01T00:00', '2026-01-31T00:00')

    expect(range.startDate).toEqual(new Date('2026-01-01T00:00'))
    expect(range.endDate).toEqual(new Date('2026-01-31T00:00'))
  })

  it('omits startDate for the "all" period', () => {
    const range = resolveDateRange('all', undefined, undefined)

    expect(range.startDate).toBeUndefined()
  })

  it('resolves a startDate N days back for a preset period', () => {
    const range = resolveDateRange('7d', undefined, undefined)

    const expected = new Date()
    expected.setDate(expected.getDate() - 7)
    expect(range.startDate?.toDateString()).toBe(expected.toDateString())
  })

  it('resolves 90 days for the 90d period', () => {
    const range = resolveDateRange('90d', undefined, undefined)

    const expected = new Date()
    expected.setDate(expected.getDate() - 90)
    expect(range.startDate?.toDateString()).toBe(expected.toDateString())
  })
})

describe('resolveUsageLogSources', () => {
  it('expands mothership into copilot ledger sources', () => {
    expect(resolveUsageLogSources({ sourceGroup: 'mothership' })).toEqual([
      'copilot',
      'workspace-chat',
      'mcp_copilot',
      'mothership_block',
    ])
  })

  it('maps workflow group to workflow source', () => {
    expect(resolveUsageLogSources({ sourceGroup: 'workflow' })).toEqual(['workflow'])
  })

  it('wraps a single source', () => {
    expect(resolveUsageLogSources({ source: 'enrichment' })).toEqual(['enrichment'])
  })

  it('returns undefined when no filter is set', () => {
    expect(resolveUsageLogSources({})).toBeUndefined()
  })
})
