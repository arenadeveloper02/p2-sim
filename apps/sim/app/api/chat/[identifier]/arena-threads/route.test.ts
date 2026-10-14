/**
 * @vitest-environment node
 */
import { mockEnvObject } from '@sim/testing'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockList, mockCreate } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
}))

vi.mock('@/lib/chat/arena-agent-history', () => ({
  listArenaAgentThreads: mockList,
  createArenaAgentThread: mockCreate,
}))

import { GET, POST } from '@/app/api/chat/[identifier]/arena-threads/route'

const context = { params: Promise.resolve({ identifier: 'advance-analytics' }) }

function authed(url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', 'Bearer cron-test-secret')
  return new NextRequest(url, { ...init, headers })
}

describe('arena agent threads route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnvObject.CRON_SECRET = 'cron-test-secret'
  })

  it('rejects a caller without the cron secret before listing', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/chat/advance-analytics/arena-threads?arenaUserId=user-1&publicUuid=dash-1'
      ),
      context
    )

    expect(response.status).toBe(401)
    expect(mockList).not.toHaveBeenCalled()
  })

  it('lists threads for the arena user and dashboard', async () => {
    mockList.mockResolvedValue([
      {
        id: 'thread-row',
        arenaUserId: 'user-1',
        publicUuid: 'dash-1',
        chatSlug: 'advance-analytics',
        chatId: 'chat-1',
        title: 'hello',
        pinnedAt: null,
        createdAt: '2026-10-14T00:00:00.000Z',
        updatedAt: '2026-10-14T00:00:00.000Z',
      },
    ])

    const response = await GET(
      authed(
        'http://localhost:3000/api/chat/advance-analytics/arena-threads?arenaUserId=user-1&publicUuid=dash-1'
      ),
      context
    )

    expect(response.status).toBe(200)
    expect(mockList).toHaveBeenCalledWith({
      arenaUserId: 'user-1',
      publicUuid: 'dash-1',
      chatSlug: 'advance-analytics',
    })
    await expect(response.json()).resolves.toEqual({
      records: [
        {
          id: 'thread-row',
          arenaUserId: 'user-1',
          publicUuid: 'dash-1',
          chatSlug: 'advance-analytics',
          chatId: 'chat-1',
          title: 'hello',
          pinnedAt: null,
          createdAt: '2026-10-14T00:00:00.000Z',
          updatedAt: '2026-10-14T00:00:00.000Z',
        },
      ],
      total: 1,
    })
  })

  it('creates a thread under the slug from the path', async () => {
    mockCreate.mockResolvedValue({
      ok: true,
      thread: {
        id: 'thread-row',
        arenaUserId: 'user-1',
        publicUuid: 'dash-1',
        chatSlug: 'advance-analytics',
        chatId: 'chat-1',
        title: 'New chat',
        pinnedAt: null,
        createdAt: '2026-10-14T00:00:00.000Z',
        updatedAt: '2026-10-14T00:00:00.000Z',
      },
    })

    const response = await POST(
      authed('http://localhost:3000/api/chat/advance-analytics/arena-threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          arenaUserId: 'user-1',
          publicUuid: 'dash-1',
          chatId: 'chat-1',
          title: 'New chat',
        }),
      }),
      context
    )

    expect(response.status).toBe(200)
    expect(mockCreate).toHaveBeenCalledWith({
      arenaUserId: 'user-1',
      publicUuid: 'dash-1',
      chatSlug: 'advance-analytics',
      chatId: 'chat-1',
      title: 'New chat',
    })
  })
})
