/**
 * @vitest-environment node
 */
import { authMockFns, dbChainMockFns, resetDbChainMock } from '@sim/testing'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckWorkflowAccess, mockRunGenerativeAppAction } = vi.hoisted(() => ({
  mockCheckWorkflowAccess: vi.fn(),
  mockRunGenerativeAppAction: vi.fn(),
}))

vi.mock('@/app/api/chat/utils', () => ({
  checkWorkflowAccessForChatCreation: mockCheckWorkflowAccess,
}))

vi.mock('@/lib/arena-generative-ui/run-action', () => ({
  runGenerativeAppAction: (...args: unknown[]) => mockRunGenerativeAppAction(...args),
}))

import { POST } from '@/app/api/gui-apps/drafts/[id]/actions/[actionId]/route'

const draftRow = {
  id: 'draft-1',
  workspaceId: 'ws-1',
  workflowId: 'wf-1',
  userId: 'owner-1',
  title: 'Lead score',
  entryPath: 'home',
  revision: 1,
  manifest: {
    entryPath: 'home',
    pages: {},
    actions: {
      submit_lead: { apiKey: 'qualify_lead' },
    },
  },
  apiBindings: [],
}

function actionRequest() {
  return new NextRequest('http://localhost:3000/api/gui-apps/drafts/draft-1/actions/submit_lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ values: { name: 'Ada' } }),
  })
}

describe('Generative app draft action route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    authMockFns.mockGetSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockCheckWorkflowAccess.mockResolvedValue({ hasAccess: true })
    mockRunGenerativeAppAction.mockResolvedValue({ ok: true, navigate: 'results' })
  })

  it('returns 401 when the user is not authenticated', async () => {
    authMockFns.mockGetSession.mockResolvedValue(null)
    const response = await POST(actionRequest(), {
      params: Promise.resolve({ id: 'draft-1', actionId: 'submit_lead' }),
    })
    expect(response.status).toBe(401)
    expect(mockRunGenerativeAppAction).not.toHaveBeenCalled()
  })

  it('returns 404 when the draft is missing', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([])
    const response = await POST(actionRequest(), {
      params: Promise.resolve({ id: 'draft-1', actionId: 'submit_lead' }),
    })
    expect(response.status).toBe(404)
    expect(mockRunGenerativeAppAction).not.toHaveBeenCalled()
  })

  it('returns 404 when the user cannot access the workflow', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([draftRow])
    mockCheckWorkflowAccess.mockResolvedValue({ hasAccess: false })
    const response = await POST(actionRequest(), {
      params: Promise.resolve({ id: 'draft-1', actionId: 'submit_lead' }),
    })
    expect(response.status).toBe(404)
    expect(mockRunGenerativeAppAction).not.toHaveBeenCalled()
  })

  it('runs the shared action runner for an accessible draft', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([draftRow])
    const response = await POST(actionRequest(), {
      params: Promise.resolve({ id: 'draft-1', actionId: 'submit_lead' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.navigate).toBe('results')
    expect(mockRunGenerativeAppAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: 'submit_lead',
        actorUserId: 'user-1',
        userId: 'owner-1',
        workspaceId: 'ws-1',
        values: { name: 'Ada' },
      })
    )
  })

  it('returns the runner error when the bound workflow is not deployed', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([draftRow])
    mockRunGenerativeAppAction.mockResolvedValue({
      ok: false,
      error: 'Bound workflow is not deployed',
    })
    const response = await POST(actionRequest(), {
      params: Promise.resolve({ id: 'draft-1', actionId: 'submit_lead' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/not deployed/i)
  })
})
