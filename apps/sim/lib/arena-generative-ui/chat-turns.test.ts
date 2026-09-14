/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  chatTurnPair,
  chatTurnsFromState,
  chatTurnsSeedFromCta,
  chatUserMessageFromValues,
  lastAssistantErrorPatch,
  lastAssistantPatch,
  withLastAssistantContent,
  withLastAssistantError,
} from '@/lib/arena-generative-ui/chat-turns'
import {
  ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_ERROR_KEY,
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

describe('chatUserMessageFromValues', () => {
  it('prefers typed input over form fields', () => {
    expect(chatUserMessageFromValues({ input: 'Hello', name: 'Ada' })).toBe('Hello')
  })

  it('joins filled form fields for a first CTA', () => {
    expect(chatUserMessageFromValues({ name: 'Ada', company: 'Acme', conversationId: 'c1' })).toBe(
      'name: Ada company: Acme'
    )
  })
})

describe('chatTurnsSeedFromCta', () => {
  it('seeds Chat composer submits', () => {
    expect(chatTurnsSeedFromCta('ask', { input: 'Hi' }, 'chat')).toEqual(chatTurnPair('Hi'))
  })

  it('seeds a chat-protocol Form CTA from field values', () => {
    expect(
      chatTurnsSeedFromCta('ask', { name: 'Ada' }, 'form', { ask: { input: true } })
    ).toEqual(chatTurnPair('name: Ada'))
  })

  it('does not seed a non-chat Form CTA', () => {
    expect(chatTurnsSeedFromCta('save', { name: 'Ada' }, 'form', {})).toBeUndefined()
  })
})

describe('withLastAssistantError', () => {
  it('marks the last assistant turn', () => {
    expect(
      withLastAssistantError(
        [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: '' },
        ],
        'Try again.'
      )
    ).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: '', error: 'Try again.' },
    ])
  })
})

describe('lastAssistantErrorPatch', () => {
  it('uses the merge sentinel key', () => {
    expect(lastAssistantErrorPatch('Try again.')).toEqual({
      [ARENA_GENERATIVE_CHAT_LAST_ASSISTANT_ERROR_KEY]: 'Try again.',
    })
  })
})
