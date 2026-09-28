/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { getAnthropicAutomaticCacheControl } from '@/lib/anthropic/prompt-cache'
import {
  parseAnthropicUsage,
  resolveLocalAnthropicThinkingRequest,
  toAnthropicTools,
} from '@/local-copilot/lib/providers/anthropic'

describe('resolveLocalAnthropicThinkingRequest', () => {
  it('returns adaptive thinking for sonnet 4.6 with summarized display', () => {
    const result = resolveLocalAnthropicThinkingRequest('claude-sonnet-4-6', 'medium')
    expect(result).not.toBeNull()
    expect(result?.thinking).toMatchObject({
      type: 'adaptive',
      display: 'summarized',
    })
    expect(result?.outputConfig).toMatchObject({ effort: 'medium' })
  })

  it('returns null when thinking is disabled', () => {
    expect(resolveLocalAnthropicThinkingRequest('claude-sonnet-4-6', 'none')).toBeNull()
    expect(resolveLocalAnthropicThinkingRequest('claude-sonnet-4-6', undefined)).toBeNull()
  })
})

describe('toAnthropicTools', () => {
  it('adds cache_control only on the last tool', () => {
    const tools = toAnthropicTools([
      { name: 'a', description: 'A', parameters: { type: 'object' } },
      { name: 'b', description: 'B', parameters: { type: 'object' } },
    ])
    expect(tools?.[0]).not.toHaveProperty('cache_control')
    expect(tools?.[1]).toMatchObject({
      name: 'b',
      cache_control: getAnthropicAutomaticCacheControl(),
    })
  })

  it('returns undefined for empty tools', () => {
    expect(toAnthropicTools([])).toBeUndefined()
    expect(toAnthropicTools(undefined)).toBeUndefined()
  })
})

describe('parseAnthropicUsage', () => {
  it('maps cache read/write fields', () => {
    expect(
      parseAnthropicUsage({
        input_tokens: 50,
        output_tokens: 12,
        cache_read_input_tokens: 100000,
        cache_creation_input_tokens: 0,
      })
    ).toEqual({
      inputTokens: 50,
      outputTokens: 12,
      cacheReadTokens: 100000,
      cacheCreationTokens: 0,
    })
  })

  it('omits cache fields when absent', () => {
    expect(parseAnthropicUsage({ input_tokens: 10, output_tokens: 2 })).toEqual({
      inputTokens: 10,
      outputTokens: 2,
    })
  })
})
