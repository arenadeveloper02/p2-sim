/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  applyChatProtocolToActionValues,
  chatActionValues,
  chatProtocolFromWorkflowFields,
  omitReservedStartInputValues,
  parseChatProtocol,
} from '@/lib/arena-generative-ui/chat-protocol'

describe('chatProtocolFromWorkflowFields', () => {
  it('records only reserved Start names', () => {
    expect(
      chatProtocolFromWorkflowFields([
        { name: 'input' },
        { name: 'conversationId' },
        { name: 'files' },
        { name: 'companyName' },
      ])
    ).toEqual({ input: true, conversationId: true, files: true })
  })

  it('is undefined when the start block has no reserved fields', () => {
    expect(chatProtocolFromWorkflowFields([{ name: 'companyName' }])).toBeUndefined()
  })
})

describe('parseChatProtocol', () => {
  it('keeps only known true flags', () => {
    expect(parseChatProtocol({ input: true, files: false, extra: true })).toEqual({ input: true })
  })
})

describe('applyChatProtocolToActionValues', () => {
  const binding = {
    chatProtocol: { input: true, conversationId: true, files: true },
  }

  it('strips reserved keys on form submits', () => {
    expect(
      applyChatProtocolToActionValues(
        { companyName: 'Acme', input: 'hi', conversationId: 'c1', files: [] },
        binding,
        'form'
      )
    ).toEqual({ companyName: 'Acme' })
  })

  it('strips reserved keys when surface is omitted so existing forms stay reserved-free', () => {
    expect(
      applyChatProtocolToActionValues(
        { brand: 'X', input: 'should-drop', conversationId: 'c1' },
        binding
      )
    ).toEqual({ brand: 'X' })
  })

  it('keeps protocol keys on chat submits and declared form values', () => {
    expect(
      applyChatProtocolToActionValues(
        { companyName: 'Acme', input: 'hi', conversationId: 'c1', files: [{ type: 'file' }] },
        binding,
        'chat'
      )
    ).toEqual({
      companyName: 'Acme',
      input: 'hi',
      conversationId: 'c1',
      files: [{ type: 'file' }],
    })
  })
})

describe('chatActionValues', () => {
  it('merges host inputs and drops reserved names from that snapshot', () => {
    expect(
      chatActionValues({
        hostInputs: { companyName: 'Acme', input: 'old' },
        input: 'new',
        conversationId: 'thread-1',
        protocol: { input: true, conversationId: true },
      })
    ).toEqual({ companyName: 'Acme', input: 'new', conversationId: 'thread-1' })
  })
})

describe('omitReservedStartInputValues', () => {
  it('drops reserved Start names case-insensitively', () => {
    expect(omitReservedStartInputValues({ Files: [], keyword: 'a', INPUT: 'x' })).toEqual({
      keyword: 'a',
    })
  })
})
