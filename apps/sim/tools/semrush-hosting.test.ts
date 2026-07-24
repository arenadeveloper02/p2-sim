/**
 * @vitest-environment node
 *
 * Import via the registry to avoid the pre-existing query → utils → registry
 * circular dependency that surfaces when loading `semrush/query` directly.
 */
import { describe, expect, it } from 'vitest'
import { semrushHosting } from '@/tools/semrush/hosting'
import { tools } from '@/tools/registry'

const semrushQueryTool = tools.semrush_query
const semrushOrganicPositionsTool = tools.semrush_organic_positions

function cost(tool: typeof semrushQueryTool, output: Record<string, unknown> = {}) {
  const pricing = tool.hosting?.pricing
  if (!pricing || pricing.type !== 'custom') throw new Error('Expected custom pricing')
  const result = pricing.getCost({}, output)
  return typeof result === 'number' ? { cost: result } : result
}

describe('Semrush hosted key config', () => {
  it('exports shared hosting helper', () => {
    expect(semrushHosting.envKeyPrefix).toBe('SEMRUSH_API_KEY')
    expect(semrushHosting.apiKeyParam).toBe('apiKey')
    expect(semrushHosting.byokProviderId).toBe('semrush')
  })

  it('declares shared hosting on both tools', () => {
    for (const tool of [semrushQueryTool, semrushOrganicPositionsTool]) {
      expect(tool.hosting?.envKeyPrefix).toBe('SEMRUSH_API_KEY')
      expect(tool.hosting?.apiKeyParam).toBe('apiKey')
      expect(tool.hosting?.byokProviderId).toBe('semrush')
    }
  })

  it('forwards apiKey via X-Semrush-Api-Key header', () => {
    for (const tool of [semrushQueryTool, semrushOrganicPositionsTool]) {
      const headers = tool.request.headers as (params: {
        apiKey?: string
      }) => Record<string, string>
      expect(headers({ apiKey: 'sm-key' })['X-Semrush-Api-Key']).toBe('sm-key')
      expect(headers({})['X-Semrush-Api-Key']).toBeUndefined()
    }
  })

  it('uses placeholder $0.01 per request', () => {
    expect(cost(semrushQueryTool).cost).toBeCloseTo(0.01)
    expect(cost(semrushOrganicPositionsTool).cost).toBeCloseTo(0.01)
  })
})
