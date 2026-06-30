/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  compactChatHistory,
  fitPromptToTokenBudget,
  LOCAL_COPILOT_RECENT_TURNS_FULL,
  LOCAL_COPILOT_WORKFLOW_FULL_STATE_TOKEN_BUDGET,
  resolveWorkflowContextDetail,
} from '@/local-copilot/lib/context/context-budget'
import type { ChatMessage } from '@/local-copilot/lib/providers/types'
import type { LocalCopilotStructuredContext } from '@/local-copilot/lib/types'

function makeHistoryMessage(role: 'user' | 'assistant', index: number): ChatMessage {
  return { role, content: `${role} message ${index}` }
}

describe('compactChatHistory', () => {
  it('keeps recent turns verbatim when under the turn threshold', () => {
    const messages = [
      makeHistoryMessage('user', 1),
      makeHistoryMessage('assistant', 1),
      makeHistoryMessage('user', 2),
      makeHistoryMessage('assistant', 2),
    ]

    expect(compactChatHistory(messages, { recentTurnsFull: 4 })).toEqual(messages)
  })

  it('compresses older turns into a system summary', () => {
    const messages: ChatMessage[] = []
    for (let turn = 1; turn <= LOCAL_COPILOT_RECENT_TURNS_FULL + 2; turn++) {
      messages.push(makeHistoryMessage('user', turn), makeHistoryMessage('assistant', turn))
    }

    const compacted = compactChatHistory(messages, { recentTurnsFull: 2 })
    expect(compacted[0]?.role).toBe('system')
    expect(compacted[0]?.content).toContain('Earlier conversation (compressed summary')
    expect(compacted.some((message) => message.content === `user message ${LOCAL_COPILOT_RECENT_TURNS_FULL + 2}`)).toBe(
      true
    )
  })
})

describe('fitPromptToTokenBudget', () => {
  it('drops oldest conversational messages when over budget', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'a'.repeat(400) },
      { role: 'assistant', content: 'b'.repeat(400) },
      { role: 'user', content: 'latest question' },
    ]

    const fitted = fitPromptToTokenBudget(messages, 120)
    expect(fitted.some((message) => message.content === 'latest question')).toBe(true)
    expect(fitted.filter((message) => message.role === 'system')).toHaveLength(1)
    expect(fitted.length).toBeLessThan(messages.length)
  })
})

describe('resolveWorkflowContextDetail', () => {
  it('uses compact workflow detail when full state exceeds the budget', () => {
    const hugeValue = 'x'.repeat(LOCAL_COPILOT_WORKFLOW_FULL_STATE_TOKEN_BUDGET * 4 + 10_000)
    const context: LocalCopilotStructuredContext = {
      workspace: { id: 'ws-1', name: 'Workspace', environment: 'self_hosted' },
      workflow: {
        id: 'wf-1',
        name: 'Large workflow',
        blocks: {
          'block-1': {
            id: 'block-1',
            type: 'agent',
            name: 'Agent',
            position: { x: 0, y: 0 },
            subBlocks: {
              prompt: { id: 'prompt', type: 'long-input', value: hugeValue },
            },
            outputs: {},
            enabled: true,
          },
        },
        edges: [],
        variables: {},
        loops: {},
        parallels: {},
        credentials: [],
      },
      execution: {
        lastRunStatus: 'unknown',
        logs: [],
        failedBlockId: null,
        error: null,
      },
      availableIntegrations: [],
      availableBlocks: [],
    }

    expect(resolveWorkflowContextDetail(context)).toBe('compact')
  })
})
