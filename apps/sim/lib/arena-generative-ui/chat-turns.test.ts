/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  chatTurnPair,
  chatTurnsFromState,
  lastAssistantPatch,
  withLastAssistantContent,
} from '@/lib/arena-generative-ui/chat-turns'
import {
  ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_KEY,
  ARENA_GENERATIVE_CHAT_TURNS_KEY,
} from '@/lib/arena-generative-ui/types'

describe('chatTurnsFromState', () => {
  it('drops invalid entries', () => {
    expect(
      chatTurnsFromState({
        [ARENA_GENERATIVE_CHAT_TURNS_KEY]: [
          { role: 'user', content: 'Hi' },
          { role: 'system', content: 'nope' },
          'x',
          { role: 'assistant', content: 3 },
        ],
      })
    ).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: '' },
    ])
  })
})

describe('chatTurnPair', () => {
  it('opens an empty assistant slot after the user turn', () => {
    expect(chatTurnPair('Hello')).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: '' },
    ])
  })
})

describe('withLastAssistantContent', () => {
  it('patches the last assistant turn', () => {
    expect(
      withLastAssistantContent(
        [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: '' },
        ],
        'Hello'
      )
    ).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ])
  })

  it('returns undefined when there is no assistant slot', () => {
    expect(withLastAssistantContent([], 'Hello')).toBeUndefined()
    expect(withLastAssistantContent([{ role: 'user', content: 'Hi' }], 'Hello')).toBeUndefined()
  })
})

describe('lastAssistantPatch', () => {
  it('uses the merge sentinel key', () => {
    expect(lastAssistantPatch('Hello')).toEqual({
      [ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_KEY]: 'Hello',
    })
  })
})
