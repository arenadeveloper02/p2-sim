/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { PersistedMessage } from '@/lib/copilot/chat/persisted-message'
import {
  MothershipStreamV1EventType,
  MothershipStreamV1TextChannel,
  MothershipStreamV1ToolOutcome,
} from '@/lib/copilot/generated/mothership-stream-v1'
import { assistantMessageToChatHistory } from '@/local-copilot/lib/mothership-history'

describe('assistantMessageToChatHistory', () => {
  it('collapses tool turns without thought signatures so follow-up thinking can run', () => {
    const message: PersistedMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: '2026-01-01T00:00:00.000Z',
      contentBlocks: [
        {
          type: MothershipStreamV1EventType.text,
          channel: MothershipStreamV1TextChannel.thinking,
          content: 'I should search first.',
        },
        {
          type: MothershipStreamV1EventType.tool,
          toolCall: {
            id: 't1',
            name: 'grep',
            state: MothershipStreamV1ToolOutcome.success,
            params: { query: 'x' },
            result: { success: true, output: { matches: 2 } },
          },
        },
        {
          type: MothershipStreamV1EventType.text,
          channel: MothershipStreamV1TextChannel.assistant,
          content: 'Found two matches.',
        },
      ],
    }

    const history = assistantMessageToChatHistory(message)

    expect(history).toHaveLength(2)
    expect(history[0].role).toBe('assistant')
    expect(history[0].content).not.toContain('I should search first.')
    expect(history[0].content).toContain('Called `grep`')
    expect(history[0].toolCalls).toBeUndefined()
    expect(history[1]).toEqual({
      role: 'assistant',
      content: 'Found two matches.',
    })
  })

  it('omits prior CoT from prose-only turns so the next user message can think fresh', () => {
    const message: PersistedMessage = {
      id: 'a3',
      role: 'assistant',
      content: '',
      timestamp: '2026-01-01T00:00:00.000Z',
      contentBlocks: [
        {
          type: MothershipStreamV1EventType.text,
          channel: MothershipStreamV1TextChannel.thinking,
          content: 'Prior chain of thought.',
        },
        {
          type: MothershipStreamV1EventType.text,
          channel: MothershipStreamV1TextChannel.assistant,
          content: 'Here is the answer.',
        },
      ],
    }

    expect(assistantMessageToChatHistory(message)).toEqual([
      {
        role: 'assistant',
        content: 'Here is the answer.',
        geminiModelParts: [
          {
            text: 'Prior chain of thought.',
            thought: true,
          },
          {
            text: 'Here is the answer.',
          },
        ],
      },
    ])
  })

  it('replays tool turns when thought signatures are present', () => {
    const message: PersistedMessage = {
      id: 'a2',
      role: 'assistant',
      content: '',
      timestamp: '2026-01-01T00:00:00.000Z',
      contentBlocks: [
        {
          type: MothershipStreamV1EventType.tool,
          toolCall: {
            id: 't1',
            name: 'grep',
            state: MothershipStreamV1ToolOutcome.success,
            params: { query: 'x' },
            result: { success: true, output: { ok: true } },
            thoughtSignature: 'sig-1',
          },
        },
      ],
    }

    const history = assistantMessageToChatHistory(message)
    expect(history[0]).toMatchObject({
      role: 'assistant',
      toolCalls: [{ id: 't1', name: 'grep', thoughtSignature: 'sig-1' }],
    })
    expect(history[1]).toMatchObject({ role: 'tool', toolCallId: 't1' })
  })

  it('rebuilds geminiModelParts with thought signatures for follow-up user turns', () => {
    const message: PersistedMessage = {
      id: 'a4',
      role: 'assistant',
      content: '',
      timestamp: '2026-01-01T00:00:00.000Z',
      contentBlocks: [
        {
          type: MothershipStreamV1EventType.text,
          channel: MothershipStreamV1TextChannel.thinking,
          content: 'I should answer carefully.',
          thoughtSignature: 'thought-sig',
        },
        {
          type: MothershipStreamV1EventType.text,
          channel: MothershipStreamV1TextChannel.assistant,
          content: 'Here is the answer.',
          thoughtSignature: 'final-sig',
        },
      ],
    }

    expect(assistantMessageToChatHistory(message)).toEqual([
      {
        role: 'assistant',
        content: 'Here is the answer.',
        geminiModelParts: [
          {
            text: 'I should answer carefully.',
            thought: true,
            thoughtSignature: 'thought-sig',
          },
          {
            text: 'Here is the answer.',
            thoughtSignature: 'final-sig',
          },
        ],
      },
    ])
  })
})
