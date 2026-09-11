/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import * as semrushModule from '@/tools/semrush'
import { semrushHosting } from '@/tools/semrush/hosting'
import type { ToolConfig } from '@/tools/types'

const semrushTools = Object.values(semrushModule).filter(
  (value): value is ToolConfig =>
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    String((value as { id?: unknown }).id).startsWith('semrush_')
)

function cost(tool: (typeof semrushTools)[number], output: Record<string, unknown> = {}) {
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

  it('declares shared hosting on every Semrush tool', () => {
    expect(semrushTools.length).toBeGreaterThan(0)
    for (const tool of semrushTools) {
      expect(tool.hosting?.envKeyPrefix).toBe('SEMRUSH_API_KEY')
      expect(tool.hosting?.apiKeyParam).toBe('apiKey')
      expect(tool.hosting?.byokProviderId).toBe('semrush')
    }
  })

  it('uses placeholder $0.01 per request', () => {
    expect(cost(semrushTools[0]).cost).toBeCloseTo(0.01)
  })
})
