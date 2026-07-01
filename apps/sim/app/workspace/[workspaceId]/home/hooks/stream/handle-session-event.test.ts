/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MothershipStreamV1SessionKind } from '@/lib/copilot/generated/mothership-stream-v1'
import type { PersistedStreamEventEnvelope } from '@/lib/copilot/request/session/contract'
import type { StreamLoopContext } from '@/app/workspace/[workspaceId]/home/hooks/stream/stream-context'
import { handleSessionEvent } from '@/app/workspace/[workspaceId]/home/hooks/stream/handle-session-event'

function makeSessionEvent(chatId: string): Extract<PersistedStreamEventEnvelope, { type: 'session' }> {
  return {
    type: 'session',
    payload: { kind: MothershipStreamV1SessionKind.chat, chatId },
    seq: 1,
    stream: { streamId: 'stream-1' },
    ts: '2026-01-01T00:00:00Z',
    v: 1,
  } as Extract<PersistedStreamEventEnvelope, { type: 'session' }>
}

function makeCtx(isEmbedPage: boolean): StreamLoopContext {
  const chatIdRef = { current: undefined as string | undefined }
  const selectedChatIdRef = { current: undefined as string | undefined }
  const workflowIdRef = { current: undefined as string | undefined }
  const isEmbedPageRef = { current: isEmbedPage }

  return {
    state: {} as StreamLoopContext['state'],
    ops: {} as StreamLoopContext['ops'],
    deps: {
      workspaceId: 'ws-1',
      chatIdRef,
      selectedChatIdRef,
      workflowIdRef,
      isEmbedPageRef,
      setResolvedChatId: vi.fn(),
      queryClient: { invalidateQueries: vi.fn() },
      pendingUserMsgRef: { current: null },
      streamIdRef: { current: undefined },
      activeTurnRef: { current: null },
      streamingContentRef: { current: '' },
      streamingBlocksRef: { current: [] },
      resourcesRef: { current: [] },
      setPendingMessages: vi.fn(),
      buildAssistantSnapshotMessage: vi.fn(),
      queryClient_setQueryData: vi.fn(),
    } as unknown as StreamLoopContext['deps'],
  }
}

describe('handleSessionEvent', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState({}, '', '/workspace/ws-1/home/embed?role=exec')
  })

  it('keeps embed chats on the task embed route', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const ctx = makeCtx(true)

    handleSessionEvent(ctx, makeSessionEvent('chat-1'))

    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/workspace/ws-1/task/chat-1/embed?role=exec'
    )
  })

  it('uses the standard chat route outside embed', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const ctx = makeCtx(false)

    handleSessionEvent(ctx, makeSessionEvent('chat-1'))

    expect(replaceState).toHaveBeenCalledWith(null, '', '/workspace/ws-1/chat/chat-1?role=exec')
  })
})
