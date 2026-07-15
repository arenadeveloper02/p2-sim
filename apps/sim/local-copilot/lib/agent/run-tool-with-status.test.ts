/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runToolWithStatus } from '@/local-copilot/lib/agent/run-tool-with-status'
import { sleep } from '@sim/utils/helpers'

describe('runToolWithStatus', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('yields start status and onProgress before returning the result', async () => {
    const events: Array<{ type: string; message?: string }> = []
    const gen = runToolWithStatus({
      toolCallId: 'tc-1',
      toolName: 'edit_content',
      args: { fileName: 'Deck.pptx' },
      execute: async (onProgress) => {
        onProgress('Compiling document…')
        await sleep(1)
        return {
          toolName: 'edit_content',
          success: true,
          result: { ok: true },
        }
      },
    })

    let result = await gen.next()
    while (!result.done) {
      events.push(result.value)
      result = await gen.next()
    }

    expect(events[0]).toMatchObject({
      type: 'status',
      message: expect.stringContaining('Deck.pptx'),
    })
    expect(events.some((event) => event.message === 'Compiling document…')).toBe(true)
    expect(result.value).toMatchObject({ success: true })
  })

  it('emits a heartbeat when a tool runs longer than 8s without progress', async () => {
    vi.useFakeTimers()
    const gen = runToolWithStatus({
      toolCallId: 'tc-2',
      toolName: 'run_workflow',
      args: { workflowName: 'Onboard' },
      execute: async () => {
        await sleep(20_000)
        return {
          toolName: 'run_workflow',
          success: true,
          result: { ok: true },
        }
      },
    })

    const first = await gen.next()
    expect(first.value).toMatchObject({ type: 'status' })

    const heartbeatPromise = gen.next()
    await vi.advanceTimersByTimeAsync(8100)
    const heartbeat = await heartbeatPromise
    expect(heartbeat.value).toMatchObject({
      type: 'status',
      message: expect.stringMatching(/Still|working|workflow/i),
    })

    const finishPromise = (async () => {
      let step = await gen.next()
      while (!step.done) {
        step = await gen.next()
      }
      return step.value
    })()
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(finishPromise).resolves.toMatchObject({ success: true })
  })
})
