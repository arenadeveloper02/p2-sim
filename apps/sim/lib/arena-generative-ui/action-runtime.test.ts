/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  chatResultLastAssistantPatch,
  createActionGenerationClock,
  hostStatePatchFromResult,
  setStatePreservingStreamContent,
  shouldShowSaveToast,
  visitorFacingActionError,
} from '@/lib/arena-generative-ui/action-runtime'

describe('createActionGenerationClock', () => {
  it('treats only the latest begin for an action as current', () => {
    const clock = createActionGenerationClock()
    const first = clock.begin('save')
    const second = clock.begin('save')
    expect(clock.isCurrent('save', first)).toBe(false)
    expect(clock.isCurrent('save', second)).toBe(true)
  })

  it('tracks actions independently so a newer search does not stale a save', () => {
    const clock = createActionGenerationClock()
    const save = clock.begin('save')
    clock.begin('search')
    expect(clock.isCurrent('save', save)).toBe(true)
  })
})

describe('setStatePreservingStreamContent', () => {
  it('keeps streamed tokens when a failed patch would wipe content', () => {
    expect(setStatePreservingStreamContent({ content: '', score: 1 }, false)).toEqual({
      score: 1,
    })
    expect(setStatePreservingStreamContent({ error: 'boom' }, false)).toEqual({ error: 'boom' })
  })

  it('does not rewrite a successful patch', () => {
    expect(setStatePreservingStreamContent({ content: 'Hello' }, true)).toEqual({
      content: 'Hello',
    })
  })
})

describe('shouldShowSaveToast', () => {
  it('shows a toast for a same-page save with no visible result patch', () => {
    expect(shouldShowSaveToast({ ok: true, streaming: false, setState: undefined })).toBe(true)
  })

  it('skips navigate-first, streaming, and bound output', () => {
    expect(shouldShowSaveToast({ ok: true, streaming: false, navigateTo: 'results' })).toBe(false)
    expect(shouldShowSaveToast({ ok: true, streaming: true })).toBe(false)
    expect(shouldShowSaveToast({ ok: true, streaming: false, setState: { content: 'Hi' } })).toBe(
      false
    )
  })
})

describe('hostStatePatchFromResult', () => {
  it('keeps streamed content when the failed result would clear it', () => {
    const applied = hostStatePatchFromResult({
      ok: false,
      error: 'HTTP 502: upstream',
      setState: { content: '' },
    })
    expect(applied.patch.content).toBeUndefined()
    expect(applied.patch.error).toBe('upstream')
  })

  it('strips chatTurns from API setState', () => {
    const applied = hostStatePatchFromResult({
      ok: true,
      setState: { content: 'Hi', chatTurns: [{ role: 'assistant', content: 'nope' }] },
    })
    expect(applied.patch.content).toBe('Hi')
    expect(applied.patch.chatTurns).toBeUndefined()
  })
})

describe('chatResultLastAssistantPatch', () => {
  it('copies content onto the last-assistant sentinel', () => {
    expect(chatResultLastAssistantPatch({ content: 'Hello', score: 1 })).toEqual({
      content: 'Hello',
      score: 1,
      __chatLastAssistant: 'Hello',
    })
  })
})

describe('visitorFacingActionError', () => {
  it('keeps a human detail after an HTTP status', () => {
    expect(visitorFacingActionError('HTTP 422: company is required')).toBe('company is required')
  })

  it('hides status-only failures, timeouts, and implementation detail', () => {
    expect(visitorFacingActionError('HTTP 503')).toBe("This didn't go through. Try again.")
    expect(visitorFacingActionError('HTTP request timed out after 5s')).toBe(
      'This is taking too long. Try again.'
    )
    expect(visitorFacingActionError('Host "api.internal" is not allowlisted')).toBe(
      "This action isn't available right now."
    )
    expect(visitorFacingActionError('Host "api.internal" is not allowed')).toBe(
      "This action isn't available right now."
    )
    expect(visitorFacingActionError('Response exceeded 1 MB')).toBe(
      "This didn't go through. Try again."
    )
    expect(visitorFacingActionError('ENCRYPTION_KEY must be set')).toBe(
      "This action isn't available right now."
    )
    expect(visitorFacingActionError('Bound workflow is not deployed')).toBe(
      "This action isn't available right now."
    )
  })
})
