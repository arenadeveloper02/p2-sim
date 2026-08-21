/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  createActionGenerationClock,
  hostStatePatchFromResult,
  setStatePreservingStreamContent,
  shouldShowSaveToast,
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
    expect(
      shouldShowSaveToast({ ok: true, streaming: false, setState: undefined })
    ).toBe(true)
  })

  it('skips navigate-first, streaming, and bound output', () => {
    expect(
      shouldShowSaveToast({ ok: true, streaming: false, navigateTo: 'results' })
    ).toBe(false)
    expect(shouldShowSaveToast({ ok: true, streaming: true })).toBe(false)
    expect(
      shouldShowSaveToast({ ok: true, streaming: false, setState: { content: 'Hi' } })
    ).toBe(false)
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
    expect(applied.patch.error).toBe('HTTP 502: upstream')
  })
})
