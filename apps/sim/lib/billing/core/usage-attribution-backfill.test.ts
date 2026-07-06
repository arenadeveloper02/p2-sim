/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  normalizeUsageLogRowForBackfill,
  resolveBackfillActorFromTrigger,
  resolveModelIdentifierForBackfill,
} from '@/lib/billing/core/usage-attribution-backfill'

describe('resolveBackfillActorFromTrigger', () => {
  it('copies user_id for human triggers', () => {
    expect(resolveBackfillActorFromTrigger('manual', 'user-1')).toEqual({
      actorType: 'user',
      actorUserId: 'user-1',
    })
    expect(resolveBackfillActorFromTrigger('chat', 'user-2')).toEqual({
      actorType: 'user',
      actorUserId: 'user-2',
    })
    expect(resolveBackfillActorFromTrigger('copilot', 'user-3')).toEqual({
      actorType: 'user',
      actorUserId: 'user-3',
    })
  })

  it('sets actor_type only for api/webhook/schedule', () => {
    expect(resolveBackfillActorFromTrigger('api', 'user-1')).toEqual({
      actorType: 'api_key',
      actorUserId: null,
    })
    expect(resolveBackfillActorFromTrigger('webhook', 'user-1')).toEqual({
      actorType: 'webhook',
      actorUserId: null,
    })
    expect(resolveBackfillActorFromTrigger('schedule', 'user-1')).toEqual({
      actorType: 'schedule',
      actorUserId: null,
    })
  })

  it('returns null for unknown triggers or missing human user_id', () => {
    expect(resolveBackfillActorFromTrigger('mcp', 'user-1')).toBeNull()
    expect(resolveBackfillActorFromTrigger('manual', null)).toBeNull()
    expect(resolveBackfillActorFromTrigger('manual', 'unknown')).toBeNull()
  })
})

describe('resolveModelIdentifierForBackfill', () => {
  it('prefers metadata.model then pricing snapshot then description', () => {
    expect(
      resolveModelIdentifierForBackfill('legacy', { model: 'gpt-4o' }, { model: 'claude-3' })
    ).toBe('gpt-4o')
    expect(resolveModelIdentifierForBackfill('legacy', null, { model: 'claude-3' })).toBe(
      'claude-3'
    )
    expect(resolveModelIdentifierForBackfill('legacy-desc', null, null)).toBe('legacy-desc')
  })
})

describe('normalizeUsageLogRowForBackfill', () => {
  it('canonicalizes model rows and fills provider/pricing snapshot', () => {
    const result = normalizeUsageLogRowForBackfill({
      category: 'model',
      description: 'GPT-4O',
      provider: null,
      toolId: null,
      metadata: null,
      pricingSnapshot: null,
    })

    expect(result?.description).toBe('gpt-4o')
    expect(result?.provider).toBe('openai')
    expect(result?.pricingSnapshot?.model).toBe('gpt-4o')
  })

  it('canonicalizes tool rows', () => {
    const result = normalizeUsageLogRowForBackfill({
      category: 'tool',
      description: 'knowledge_search_kb-1',
      provider: null,
      toolId: null,
      metadata: null,
      pricingSnapshot: null,
    })

    expect(result?.description).toBe('knowledge_search')
    expect(result?.toolId).toBe('knowledge_search')
  })

  it('returns null when model row is already normalized', () => {
    const result = normalizeUsageLogRowForBackfill({
      category: 'model',
      description: 'gpt-4o',
      provider: 'openai',
      toolId: null,
      metadata: null,
      pricingSnapshot: { model: 'gpt-4o', multiplier: 1 },
    })

    expect(result).toBeNull()
  })
})
