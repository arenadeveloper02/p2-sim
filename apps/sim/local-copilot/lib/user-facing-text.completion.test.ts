/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  contentLooksLikeCompletion,
  isNearDuplicateCompletion,
  shouldStreamAssistantRoundText,
} from '@/local-copilot/lib/user-facing-text'

const COMPLETION_PITCH = `
Your Email Summary Digest workflow is fully built and wired.

Start — kicks off the run.
Fetch Emails — pulls Gmail messages from the last 10 days (newer_than:10d).
Summarizer — an agent that groups the emails.
Create Doc — writes the digest into a Google Doc.

Connect Gmail and Connect Google Docs to finish.
`

describe('post-build completion duplicate suppression', () => {
  it('detects a typical oauth completion pitch', () => {
    expect(contentLooksLikeCompletion(COMPLETION_PITCH)).toBe(true)
  })

  it('suppresses streaming once a prior round already delivered the pitch', () => {
    expect(
      shouldStreamAssistantRoundText({
        hasToolCalls: false,
        contentBeforeRound: COMPLETION_PITCH,
        display: COMPLETION_PITCH,
      })
    ).toBe(false)
  })

  it('flags near-duplicate even before the new pitch reaches 100 chars', () => {
    expect(
      isNearDuplicateCompletion(
        COMPLETION_PITCH,
        'Your Email Summary Digest workflow is fully built'
      )
    ).toBe(true)
  })

  it('still streams the first completion when there is no prior pitch', () => {
    expect(
      shouldStreamAssistantRoundText({
        hasToolCalls: false,
        contentBeforeRound: '',
        display: COMPLETION_PITCH,
      })
    ).toBe(true)
  })
})
