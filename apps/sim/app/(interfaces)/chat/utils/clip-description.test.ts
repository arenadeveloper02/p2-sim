/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  clipDeployedChatDescription,
  DEPLOYED_CHAT_DESCRIPTION_MAX_LENGTH,
  getDeployedChatFirstName,
  normalizeComparableText,
  resolveDeployedChatLandingDescription,
} from '@/app/(interfaces)/chat/utils/clip-description'

describe('normalizeComparableText', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeComparableText('  Hello   World  ')).toBe('hello world')
  })
})

describe('resolveDeployedChatLandingDescription', () => {
  it('returns welcome message when it differs from the title', () => {
    expect(
      resolveDeployedChatLandingDescription({
        title: 'Sales Agent',
        welcomeMessage: 'Ask me about pipeline health',
      })
    ).toBe('Ask me about pipeline health')
  })

  it('omits welcome message when it duplicates the title', () => {
    expect(
      resolveDeployedChatLandingDescription({
        title: 'Sales Agent',
        welcomeMessage: '  sales   agent  ',
      })
    ).toBe('')
  })

  it('returns empty string when welcome message is missing', () => {
    expect(resolveDeployedChatLandingDescription({ title: 'Sales Agent' })).toBe('')
  })

  it('returns empty string when welcome message is blank', () => {
    expect(
      resolveDeployedChatLandingDescription({
        title: 'Sales Agent',
        welcomeMessage: '   ',
      })
    ).toBe('')
  })
})

describe('clipDeployedChatDescription', () => {
  it('returns short text unchanged', () => {
    expect(clipDeployedChatDescription('  Short copy  ')).toEqual({
      displayText: 'Short copy',
      isTruncated: false,
      fullText: 'Short copy',
    })
  })

  it('truncates text longer than the default max length', () => {
    const fullText = 'a'.repeat(DEPLOYED_CHAT_DESCRIPTION_MAX_LENGTH + 10)
    const result = clipDeployedChatDescription(fullText)

    expect(result.isTruncated).toBe(true)
    expect(result.fullText).toBe(fullText)
    expect(result.displayText).toBe(`${'a'.repeat(DEPLOYED_CHAT_DESCRIPTION_MAX_LENGTH)}...`)
    expect(result.displayText.endsWith('...')).toBe(true)
  })

  it('respects a custom max length', () => {
    expect(clipDeployedChatDescription('abcdefghij', 5)).toEqual({
      displayText: 'abcde...',
      isTruncated: true,
      fullText: 'abcdefghij',
    })
  })
})

describe('getDeployedChatFirstName', () => {
  it('returns null for nullish or blank values', () => {
    expect(getDeployedChatFirstName(null)).toBeNull()
    expect(getDeployedChatFirstName(undefined)).toBeNull()
    expect(getDeployedChatFirstName('   ')).toBeNull()
  })

  it('returns the local part of an email', () => {
    expect(getDeployedChatFirstName('vijay@example.com')).toBe('vijay')
  })

  it('returns the first token of a display name', () => {
    expect(getDeployedChatFirstName('Vijay Kumar')).toBe('Vijay')
  })
})
