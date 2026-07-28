/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  BROWSER_USE_STEP_USD,
  BROWSER_USE_TASK_INIT_USD,
} from '@/tools/browser_use/hosting'
import { runTaskTool } from '@/tools/browser_use/run_task'

function cost(output: Record<string, unknown>) {
  const pricing = runTaskTool.hosting?.pricing
  if (!pricing || pricing.type !== 'custom') throw new Error('Expected custom pricing')
  const result = pricing.getCost({}, output)
  return typeof result === 'number' ? { cost: result } : result
}

describe('Browser Use hosted key config', () => {
  it('declares hosting with browser_use BYOK provider', () => {
    expect(runTaskTool.hosting?.envKeyPrefix).toBe('BROWSER_USE_API_KEY')
    expect(runTaskTool.hosting?.apiKeyParam).toBe('apiKey')
    expect(runTaskTool.hosting?.byokProviderId).toBe('browser_use')
  })

  it('prefers API-reported __totalCostUsd', () => {
    expect(cost({ __totalCostUsd: 0.123 }).cost).toBeCloseTo(0.123)
  })

  it('prefers totalCostUsd / cost aliases', () => {
    expect(cost({ totalCostUsd: 0.05 }).cost).toBeCloseTo(0.05)
    expect(cost({ cost: 0.08 }).cost).toBeCloseTo(0.08)
  })

  it('falls back to V2 flat pricing placeholder', () => {
    const steps = [{}, {}, {}]
    expect(cost({ steps }).cost).toBeCloseTo(
      BROWSER_USE_TASK_INIT_USD + BROWSER_USE_STEP_USD * 3
    )
    expect(cost({}).cost).toBeCloseTo(BROWSER_USE_TASK_INIT_USD + BROWSER_USE_STEP_USD)
  })
})
