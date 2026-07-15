/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { shouldShowTrailingLiveStatus } from '@/app/workspace/[workspaceId]/home/hooks/stream/trailing-live-status'

describe('shouldShowTrailingLiveStatus', () => {
  it('shows liveStatus even when tools are running', () => {
    expect(
      shouldShowTrailingLiveStatus({
        isStreaming: true,
        liveStatus: 'Running workflow…',
        hasTrailingContent: false,
        hasRunningWork: true,
      })
    ).toBe(true)
  })

  it('keeps Thinking… behavior when no liveStatus', () => {
    expect(
      shouldShowTrailingLiveStatus({
        isStreaming: true,
        hasTrailingContent: false,
        hasRunningWork: true,
      })
    ).toBe(false)
    expect(
      shouldShowTrailingLiveStatus({
        isStreaming: true,
        hasTrailingContent: false,
        hasRunningWork: false,
      })
    ).toBe(true)
  })
})
