/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_EPHEMERAL_CACHE_CONTROL,
  getAnthropicAutomaticCacheControl,
  supportsAnthropicAutomaticPromptCaching,
} from '@/lib/anthropic/prompt-cache'

describe('prompt-cache', () => {
  it('returns ephemeral cache control for automatic caching', () => {
    expect(getAnthropicAutomaticCacheControl()).toEqual(ANTHROPIC_EPHEMERAL_CACHE_CONTROL)
  })

  it('enables automatic caching for direct Anthropic and Azure Anthropic providers', () => {
    expect(supportsAnthropicAutomaticPromptCaching('anthropic')).toBe(true)
    expect(supportsAnthropicAutomaticPromptCaching('azure-anthropic')).toBe(true)
    expect(supportsAnthropicAutomaticPromptCaching('bedrock')).toBe(false)
  })
})
