/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { crawlTool } from '@/tools/firecrawl/crawl'
import { scrapeTool } from '@/tools/firecrawl/scrape'

describe('Firecrawl crawl hosted key config', () => {
  it('matches scrape hosting provider and credit rate', () => {
    expect(crawlTool.hosting?.envKeyPrefix).toBe('FIRECRAWL_API_KEY')
    expect(crawlTool.hosting?.apiKeyParam).toBe('apiKey')
    expect(crawlTool.hosting?.byokProviderId).toBe('firecrawl')
    expect(scrapeTool.hosting?.byokProviderId).toBe('firecrawl')
  })

  it('uses params.apiKey in request headers', () => {
    const headers = crawlTool.request.headers as (params: {
      apiKey: string
    }) => Record<string, string>
    expect(headers({ apiKey: 'fc-key' }).Authorization).toBe('Bearer fc-key')
  })

  it('prices from metadata.creditsUsed at $0.001/credit', () => {
    const pricing = crawlTool.hosting?.pricing
    if (!pricing || pricing.type !== 'custom') throw new Error('Expected custom pricing')
    const result = pricing.getCost({}, { metadata: { creditsUsed: 25 } })
    const cost = typeof result === 'number' ? result : result.cost
    expect(cost).toBeCloseTo(0.025)
  })

  it('prices from top-level creditsUsed when metadata missing', () => {
    const pricing = crawlTool.hosting?.pricing
    if (!pricing || pricing.type !== 'custom') throw new Error('Expected custom pricing')
    const result = pricing.getCost({}, { creditsUsed: 10 })
    const cost = typeof result === 'number' ? result : result.cost
    expect(cost).toBeCloseTo(0.01)
  })

  it('throws when creditsUsed is missing', () => {
    const pricing = crawlTool.hosting?.pricing
    if (!pricing || pricing.type !== 'custom') throw new Error('Expected custom pricing')
    expect(() => pricing.getCost({}, {})).toThrow(/creditsUsed/)
  })
})
