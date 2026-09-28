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

  it('echoes Anthropic thinking blocks before tool_use for history round-trip', () => {
    const { anthropicMessages } = convertMessagesToAnthropic([
      { role: 'user', content: 'edit the file' },
      {
        role: 'assistant',
        content: '',
        anthropicThinkingBlocks: [
          { type: 'thinking', thinking: 'I should read first.', signature: 'sig-abc' },
        ],
        toolCalls: [{ id: 't1', name: 'grep', arguments: '{"query":"x"}' }],
      },
      { role: 'tool', toolCallId: 't1', content: '{"ok":true}' },
    ])

    expect(anthropicMessages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'I should read first.', signature: 'sig-abc' },
        { type: 'tool_use', id: 't1', name: 'grep', input: { query: 'x' } },
      ],
    })
  })

  it('skips unsigned Anthropic thinking blocks so tool-loop history stays valid', () => {
    const { anthropicMessages } = convertMessagesToAnthropic([
      { role: 'user', content: 'edit the file' },
      {
        role: 'assistant',
        content: '',
        anthropicThinkingBlocks: [
          { type: 'thinking', thinking: 'orphan summary', signature: '' },
          { type: 'thinking', thinking: 'signed', signature: 'sig-ok' },
        ],
        toolCalls: [{ id: 't1', name: 'grep', arguments: '{}' }],
      },
    ])

    expect(anthropicMessages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'signed', signature: 'sig-ok' },
        { type: 'tool_use', id: 't1', name: 'grep', input: {} },
      ],
    })
  })
})
