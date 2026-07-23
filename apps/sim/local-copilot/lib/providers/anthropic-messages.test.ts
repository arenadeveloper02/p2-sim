/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { getAnthropicAutomaticCacheControl } from '@/lib/anthropic/prompt-cache'
import { convertMessagesToAnthropic } from '@/local-copilot/lib/providers/anthropic-messages'

describe('convertMessagesToAnthropic system caching', () => {
  it('puts cache_control only on the first system block', () => {
    const { system } = convertMessagesToAnthropic([
      { role: 'system', content: 'STATIC RULES' },
      { role: 'system', content: 'Current context:\n{"workflow":1}' },
      { role: 'system', content: 'Workspace snapshot:\nws' },
      { role: 'user', content: 'hello' },
    ])

    expect(system).toEqual([
      {
        type: 'text',
        text: 'STATIC RULES',
        cache_control: getAnthropicAutomaticCacheControl(),
      },
      { type: 'text', text: 'Current context:\n{"workflow":1}' },
      { type: 'text', text: 'Workspace snapshot:\nws' },
    ])
  })

  it('returns a single cached system block when only static system exists', () => {
    const { system } = convertMessagesToAnthropic([
      { role: 'system', content: 'STATIC RULES' },
      { role: 'user', content: 'hi' },
    ])
    expect(system).toEqual([
      {
        type: 'text',
        text: 'STATIC RULES',
        cache_control: getAnthropicAutomaticCacheControl(),
      },
    ])
  })

  it('returns undefined system when there are no system messages', () => {
    const { system } = convertMessagesToAnthropic([{ role: 'user', content: 'hi' }])
    expect(system).toBeUndefined()
  })

  it('skips blank system messages when building blocks', () => {
    const { system } = convertMessagesToAnthropic([
      { role: 'system', content: '   ' },
      { role: 'system', content: 'STATIC RULES' },
      { role: 'system', content: 'Current context:\nx' },
      { role: 'user', content: 'hi' },
    ])
    expect(system?.[0]).toEqual({
      type: 'text',
      text: 'STATIC RULES',
      cache_control: getAnthropicAutomaticCacheControl(),
    })
    expect(system?.[1]).toEqual({ type: 'text', text: 'Current context:\nx' })
  })
})
