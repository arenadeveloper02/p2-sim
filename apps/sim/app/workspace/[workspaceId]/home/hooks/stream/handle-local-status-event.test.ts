/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import {
  handleLocalStatusEvent,
  isLocalStatusEvent,
} from '@/app/workspace/[workspaceId]/home/hooks/stream/handle-local-status-event'
import { createStreamLoopContext } from '@/app/workspace/[workspaceId]/home/hooks/stream/stream-context'
import { makeStreamLoopDeps } from '@/app/workspace/[workspaceId]/home/hooks/stream/stream-test-helpers'
import { LOCAL_STATUS_PHASE } from '@/lib/copilot/request/session/contract'

describe('handleLocalStatusEvent', () => {
  it('recognizes synthetic local status envelopes', () => {
    expect(
      isLocalStatusEvent({
        v: 1,
        type: 'run',
        seq: 1,
        ts: '2026-07-15T00:00:00.000Z',
        stream: { streamId: 's1', cursor: '1' },
        payload: { statusPhase: LOCAL_STATUS_PHASE, message: 'Writing Deck.pptx…' },
      })
    ).toBe(true)
  })

  it('sets liveStatus and flushes', () => {
    const ctx = createStreamLoopContext(makeStreamLoopDeps())
    const flush = vi.spyOn(ctx.ops, 'flush')

    handleLocalStatusEvent(ctx, {
      v: 1,
      type: 'run',
      seq: 2,
      ts: '2026-07-15T00:00:00.000Z',
      stream: { streamId: 's1', cursor: '2' },
      payload: { statusPhase: LOCAL_STATUS_PHASE, message: 'Running workflow…' },
    })

    expect(ctx.state.liveStatus).toBe('Running workflow…')
    expect(flush).toHaveBeenCalledOnce()
  })
})
