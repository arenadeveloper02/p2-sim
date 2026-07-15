/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emitIdleStatusHeartbeats } from '@/local-copilot/lib/agent/status-heartbeat'

describe('emitIdleStatusHeartbeats', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits after idle then on interval', async () => {
    vi.useFakeTimers()
    const messages = ['A', 'B'] as const
    const gen = emitIdleStatusHeartbeats({ messages, idleMs: 4000, intervalMs: 8000 })
    const first = gen.next()
    let settled = false
    void first.then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(3999)
    await Promise.resolve()
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect((await first).value).toEqual({ type: 'status', message: 'A' })

    const second = gen.next()
    await vi.advanceTimersByTimeAsync(8000)
    expect((await second).value).toEqual({ type: 'status', message: 'B' })

    await gen.return?.(undefined)
  })
})
