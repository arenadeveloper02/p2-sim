/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { mothershipMessagesToChatHistory } from '@/local-copilot/lib/mothership-history'
import type { PersistedMessage } from '@/lib/copilot/chat/persisted-message'
import { MothershipStreamV1EventType } from '@/lib/copilot/generated/mothership-stream-v1'

describe('mothershipMessagesToChatHistory', () => {
  it('maps user and assistant turns and excludes the current user message id', () => {
    const messages: PersistedMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Build a workflow',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Sure, I will create one.',
        timestamp: '2026-01-01T00:00:01.000Z',
        contentBlocks: [
          {
            type: MothershipStreamV1EventType.tool,
            toolCall: {
              id: 'tool-1',
              name: 'create_workflow',
              state: 'success',
            },
          },
        ],
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'Add a trigger block',
        timestamp: '2026-01-01T00:00:02.000Z',
      },
    ]

    const history = mothershipMessagesToChatHistory(messages, { excludeMessageId: 'user-2' })

    expect(history).toEqual([
      { role: 'user', content: 'Build a workflow' },
      {
        role: 'assistant',
        content: 'Sure, I will create one.\n[Tool create_workflow: success]',
      },
    ])
  })

  it('skips empty rows', () => {
    const history = mothershipMessagesToChatHistory([
      {
        id: 'assistant-empty',
        role: 'assistant',
        content: '',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ])

    expect(history).toEqual([])
  })
})
