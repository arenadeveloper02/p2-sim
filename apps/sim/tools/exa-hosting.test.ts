/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { answerTool } from '@/tools/exa/answer'
import { findSimilarLinksTool } from '@/tools/exa/find_similar_links'
import { getContentsTool } from '@/tools/exa/get_contents'
import { EXA_FALLBACK_COST_USD } from '@/tools/exa/hosting'
import { researchTool } from '@/tools/exa/research'
import { searchTool } from '@/tools/exa/search'
import type { ToolConfig } from '@/tools/types'

function cost(tool: ToolConfig, params: Record<string, unknown>, output: Record<string, unknown>) {
  const pricing = tool.hosting?.pricing
  if (!pricing || pricing.type !== 'custom') throw new Error('Expected custom pricing')
  const result = pricing.getCost(params, output)
  return typeof result === 'number' ? { cost: result } : result
}

const EXA_TOOLS = [
  searchTool,
  getContentsTool,
  findSimilarLinksTool,
  answerTool,
  researchTool,
] as const

describe('Exa hosted key config', () => {
  it('declares shared hosting on every Exa tool', () => {
    for (const tool of EXA_TOOLS) {
      expect(tool.hosting?.envKeyPrefix).toBe('EXA_API_KEY')
      expect(tool.hosting?.apiKeyParam).toBe('apiKey')
      expect(tool.hosting?.byokProviderId).toBe('exa')
      expect(tool.hosting?.rateLimit).toEqual({
        mode: 'per_request',
        requestsPerMinute: 60,
      })
    }
  })

  it('uses params.apiKey in request headers', () => {
    for (const tool of EXA_TOOLS) {
      const headers = tool.request.headers as (params: { apiKey: string }) => Record<string, string>
      expect(headers({ apiKey: 'test-key' })['x-api-key']).toBe('test-key')
    }
  })
})

describe('Exa hosted key pricing', () => {
  it('prefers __costDollars number', () => {
    expect(cost(searchTool, {}, { __costDollars: 0.042 }).cost).toBeCloseTo(0.042)
  })

  it('prefers __costDollars.total object shape', () => {
    expect(cost(answerTool, {}, { __costDollars: { total: 0.019 } }).cost).toBeCloseTo(0.019)
  })

  it('falls back to Search $7/1k rate when cost missing', () => {
    expect(cost(researchTool, {}, {}).cost).toBeCloseTo(EXA_FALLBACK_COST_USD)
  })
})
