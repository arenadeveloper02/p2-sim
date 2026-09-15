/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  appendGeminiStreamParts,
  chunksFromGeminiParts,
  convertMessagesToGemini,
  geminiHistoryPartToPart,
} from '@/local-copilot/lib/providers/gemini'
import type { GeminiHistoryPart } from '@/local-copilot/lib/providers/types'

describe('chunksFromGeminiParts', () => {
  it('emits thinking chunks for thought text and text for normal prose', () => {
    const chunks = chunksFromGeminiParts(
      [
        { text: 'I should inspect the workflow first.', thought: true },
        { text: 'Here is what I found.' },
        {
          functionCall: { id: 'c1', name: 'grep', args: { query: 'x' } },
          thought: true,
          thoughtSignature: 'sig',
        },
      ],
      () => 'generated-id'
    )

    expect(chunks).toEqual([
      { type: 'thinking', content: 'I should inspect the workflow first.' },
      { type: 'text', content: 'Here is what I found.' },
      {
        type: 'tool_call',
        toolCall: {
          id: 'c1',
          name: 'grep',
          arguments: '{"query":"x"}',
          thoughtSignature: 'sig',
        },
      },
    ])
  })

  it('treats stringy thought flags as thinking (Vertex edge cases)', () => {
    const chunks = chunksFromGeminiParts(
      // double-cast-allowed: Vertex occasionally serializes thought as a stringy flag
      [{ text: 'Step one.', thought: 'true' as unknown as boolean }],
      () => 'id'
    )
    expect(chunks).toEqual([{ type: 'thinking', content: 'Step one.' }])
  })
})

describe('appendGeminiStreamParts', () => {
  it('merges contiguous unsigned thought deltas; keeps signed parts separate', () => {
    const history: GeminiHistoryPart[] = []
    appendGeminiStreamParts(history, [{ text: 'Plan ', thought: true }], () => 'id-1')
    appendGeminiStreamParts(history, [{ text: 'A.', thought: true }], () => 'id-2')
    appendGeminiStreamParts(
      history,
      [
        { text: 'Final thought.', thought: true, thoughtSignature: 'thought-sig' },
        {
          functionCall: { id: 'c1', name: 'grep', args: { query: 'x' } },
          thoughtSignature: 'fc-sig',
        },
      ],
      () => 'id-3'
    )

    expect(history).toEqual([
      { text: 'Plan A.', thought: true },
      {
        text: 'Final thought.',
        thought: true,
        thoughtSignature: 'thought-sig',
      },
      {
        functionCall: { id: 'c1', name: 'grep', args: { query: 'x' } },
        thoughtSignature: 'fc-sig',
      },
    ])
  })

  it('attaches thoughtSignature from empty-text trailer parts', () => {
    const history: GeminiHistoryPart[] = []
    appendGeminiStreamParts(history, [{ text: 'Plan A', thought: true }], () => 'id-1')
    appendGeminiStreamParts(
      history,
      [{ text: '', thought: true, thoughtSignature: 'sig-empty' }],
      () => 'id-2'
    )
    appendGeminiStreamParts(history, [{ text: 'Answer', thoughtSignature: 'sig-final' }], () => 'id-3')

    expect(history).toEqual([
      { text: 'Plan A', thought: true, thoughtSignature: 'sig-empty' },
      { text: 'Answer', thoughtSignature: 'sig-final' },
    ])
  })

  it('attaches mismatched empty trailers to the last text part (no orphan signed parts)', () => {
    const history: GeminiHistoryPart[] = []
    appendGeminiStreamParts(history, [{ text: 'Plan A', thought: true }], () => 'id-1')
    appendGeminiStreamParts(history, [{ text: 'Answer' }], () => 'id-2')
    // Vertex sometimes sends the final signature after answer text with thought:true.
    appendGeminiStreamParts(
      history,
      [{ text: '', thought: true, thoughtSignature: 'sig-final' }],
      () => 'id-3'
    )

    expect(history).toEqual([
      { text: 'Plan A', thought: true },
      { text: 'Answer', thoughtSignature: 'sig-final' },
    ])
  })
})

describe('convertMessagesToGemini', () => {
  it('echoes geminiModelParts verbatim including thought text and signatures', () => {
    const { contents } = convertMessagesToGemini([
      { role: 'user', content: 'inspect the workflow' },
      {
        role: 'assistant',
        content: '',
        geminiModelParts: [
          { text: 'I should grep first.', thought: true, thoughtSignature: 't-sig' },
          {
            functionCall: { id: 'c1', name: 'grep', args: { query: 'x' } },
            thoughtSignature: 'fc-sig',
          },
        ],
        toolCalls: [
          {
            id: 'c1',
            name: 'grep',
            arguments: '{"query":"x"}',
            thoughtSignature: 'fc-sig',
          },
        ],
      },
      { role: 'tool', toolCallId: 'c1', content: '{"ok":true}' },
    ])

    expect(contents[1]).toEqual({
      role: 'model',
      parts: [
        geminiHistoryPartToPart({
          text: 'I should grep first.',
          thought: true,
          thoughtSignature: 't-sig',
        }),
        geminiHistoryPartToPart({
          functionCall: { id: 'c1', name: 'grep', args: { query: 'x' } },
          thoughtSignature: 'fc-sig',
        }),
      ],
    })
    expect(contents[2]).toMatchObject({
      role: 'user',
      parts: [{ functionResponse: { id: 'c1', name: 'grep' } }],
    })
  })

  it('echoes geminiModelParts on text-only assistant turns for follow-up CoT', () => {
    const { contents } = convertMessagesToGemini([
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: 'Hello',
        geminiModelParts: [
          { text: 'Greeting.', thought: true, thoughtSignature: 't-sig' },
          { text: 'Hello', thoughtSignature: 'final-sig' },
        ],
      },
      { role: 'user', content: 'follow up' },
    ])

    expect(contents[1]).toEqual({
      role: 'model',
      parts: [
        geminiHistoryPartToPart({
          text: 'Greeting.',
          thought: true,
          thoughtSignature: 't-sig',
        }),
        geminiHistoryPartToPart({
          text: 'Hello',
          thoughtSignature: 'final-sig',
        }),
      ],
    })
    expect(contents[2]).toEqual({ role: 'user', parts: [{ text: 'follow up' }] })
  })
})
