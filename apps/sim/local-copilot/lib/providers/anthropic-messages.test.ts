/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  convertMessagesToAnthropic,
  sanitizeToolMessagePairing,
} from '@/local-copilot/lib/providers/anthropic-messages'
import type { ChatMessage } from '@/local-copilot/lib/providers/types'

describe('sanitizeToolMessagePairing', () => {
  it('drops orphan tool results without a preceding assistant tool_use', () => {
    const messages: ChatMessage[] = [
      {
        role: 'tool',
        toolCallId: 'toolu_orphan',
        content: '{}',
      },
      { role: 'user', content: 'Hello' },
    ]

    expect(sanitizeToolMessagePairing(messages)).toEqual([{ role: 'user', content: 'Hello' }])
  })
})

describe('convertMessagesToAnthropic', () => {
  it('batches consecutive tool results into one user message', () => {
    const { anthropicMessages } = convertMessagesToAnthropic([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Run tools' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'toolu_1', name: 'edit_workflow', arguments: '{}' },
          { id: 'toolu_2', name: 'get_workflow_data', arguments: '{}' },
        ],
      },
      { role: 'tool', toolCallId: 'toolu_1', content: '{"success":true}' },
      { role: 'tool', toolCallId: 'toolu_2', content: '{"success":true}' },
      { role: 'user', content: 'Continue' },
    ])

    expect(anthropicMessages).toEqual([
      { role: 'user', content: 'Run tools' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'toolu_1', name: 'edit_workflow', input: {} },
          { type: 'tool_use', id: 'toolu_2', name: 'get_workflow_data', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"success":true}' },
          { type: 'tool_result', tool_use_id: 'toolu_2', content: '{"success":true}' },
        ],
      },
      { role: 'user', content: 'Continue' },
    ])
  })
})
