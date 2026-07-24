/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const envState = vi.hoisted(() => ({
  env: {
    INTERNAL_API_SECRET: 'test-internal-api-secret-32-chars!' as string | undefined,
  },
}))

vi.mock('@/lib/core/config/env', () => envState)

vi.mock('@/lib/core/utils/urls', () => ({
  getInternalApiBaseUrl: () => 'http://localhost:3000',
}))

import {
  postStreamBillingUpdateCost,
  resolveCopilotBillingSourceFromGoRoute,
} from '@/lib/copilot/request/billing/post-stream-update-cost'

describe('postStreamBillingUpdateCost mothership transcript-vs-ledger gaps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    envState.env.INTERNAL_API_SECRET = 'test-internal-api-secret-32-chars!'
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })))
    )
  })

  it('skips the billing callback when INTERNAL_API_SECRET is unset', async () => {
    envState.env.INTERNAL_API_SECRET = undefined

    await postStreamBillingUpdateCost({
      userId: 'user-1',
      workspaceId: 'ws-1',
      chatId: 'chat-1',
      runId: 'run-1',
      messageId: 'msg-1',
      goRoute: '/api/mothership',
      model: 'claude-opus-4.8',
      cost: 0.42,
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('skips the billing callback when cumulative cost is zero', async () => {
    await postStreamBillingUpdateCost({
      userId: 'user-1',
      workspaceId: 'ws-1',
      chatId: 'chat-1',
      runId: 'run-1',
      messageId: 'msg-1',
      goRoute: '/api/mothership',
      cost: 0,
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('POSTs cumulative cost with chat and run attribution when billing is configured', async () => {
    await postStreamBillingUpdateCost({
      userId: 'user-1',
      workspaceId: 'ws-1',
      chatId: 'chat-1',
      runId: 'run-1',
      messageId: 'msg-1',
      goRoute: '/api/mothership',
      model: 'claude-opus-4.8',
      cost: 0.42,
      inputTokens: 100,
      outputTokens: 20,
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/billing/update-cost',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-internal-api-secret-32-chars!',
        }),
      })
    )

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({
      userId: 'user-1',
      workspaceId: 'ws-1',
      chatId: 'chat-1',
      runId: 'run-1',
      cost: 0.42,
      source: 'workspace-chat',
      idempotencyKey: 'msg-1-billing',
    })
  })
})

describe('resolveCopilotBillingSourceFromGoRoute', () => {
  it('maps mothership routes to workspace-chat and mothership_block sources', () => {
    expect(resolveCopilotBillingSourceFromGoRoute('/api/mothership')).toBe('workspace-chat')
    expect(resolveCopilotBillingSourceFromGoRoute('/api/mothership/execute')).toBe(
      'mothership_block'
    )
    expect(resolveCopilotBillingSourceFromGoRoute('/api/copilot')).toBe('copilot')
  })
})
