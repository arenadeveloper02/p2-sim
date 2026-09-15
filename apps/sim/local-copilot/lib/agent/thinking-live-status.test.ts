/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  applyModelChunkToThinkingStatus,
  ThinkingLiveStatusAccumulator,
} from '@/local-copilot/lib/agent/thinking-live-status'

describe('ThinkingLiveStatusAccumulator', () => {
  it('accumulates thinking deltas and marks publishing', () => {
    const acc = new ThinkingLiveStatusAccumulator()
    const long = 'a'.repeat(200)
    acc.pushDelta('Checking the open workflow. ')
    acc.pushDelta(long)
    expect(acc.isPublishing).toBe(true)
    expect(acc.text).toBe(`Checking the open workflow. ${long}`)
    expect(acc.text.length).toBeGreaterThan(80)
  })

  it('keeps publishing through assistant prose so live status stays on thinking', () => {
    const acc = new ThinkingLiveStatusAccumulator()
    applyModelChunkToThinkingStatus(acc, { type: 'thinking', content: 'Planning…' })
    expect(acc.isPublishing).toBe(true)

    applyModelChunkToThinkingStatus(acc, { type: 'text', content: 'Here is the answer' })
    expect(acc.isPublishing).toBe(true)
    expect(acc.text).toBe('Planning…')
  })

  it('releases live status when tools begin so tool heartbeats can take over', () => {
    const acc = new ThinkingLiveStatusAccumulator()
    applyModelChunkToThinkingStatus(acc, { type: 'thinking', content: 'Planning…' })
    applyModelChunkToThinkingStatus(acc, {
      type: 'tool_call',
      content: undefined,
    })
    expect(acc.isPublishing).toBe(false)
  })
})
