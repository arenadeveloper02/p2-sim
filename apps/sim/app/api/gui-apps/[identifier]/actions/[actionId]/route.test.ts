/**
 * @vitest-environment node
 */
import { dbChainMockFns, resetDbChainMock } from '@sim/testing'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckRateLimit, mockRunAction } = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockRunAction: vi.fn(),
}))

vi.mock('@/lib/core/security/deployment-auth', () => ({
  validateDeploymentAuth: vi.fn(async () => ({ authorized: true })),
}))

vi.mock('@/lib/arena-generative-ui/rate-limit', () => ({
  checkGenerativeAppActionRateLimit: mockCheckRateLimit,
}))

vi.mock('@/lib/arena-generative-ui/run-action', () => ({
  isStreamingAction: () => false,
  runDeployedAppAction: mockRunAction,
  createDeployedAppActionSseResponse: vi.fn(),
}))

import { POST } from '@/app/api/gui-apps/[identifier]/actions/[actionId]/route'

const deployedRow = {
  id: 'app-1',
  workspaceId: 'ws-1',
  workflowId: 'wf-1',
  userId: 'user-1',
  identifier: 'lead-score',
  title: 'Lead score',
  description: null,
  department: null,
  isActive: true,
  authType: 'public',
  password: null,
  allowedEmails: [],
  requireArenaEmailId: false,
  draftId: 'draft-1',
  revisionId: 'rev-1',
  manifest: { entryPath: 'home', pages: {}, actions: { run: { apiKey: 'k' } } },
  apiBindings: [],
  httpAllowlist: [],
  archivedAt: null,
}

function actionRequest(body: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost:3000/api/gui-apps/lead-score/actions/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ identifier: 'lead-score', actionId: 'run' })

describe('Deployed app action route rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    mockCheckRateLimit.mockResolvedValue(null)
    mockRunAction.mockResolvedValue({ ok: true, setState: {} })
  })

  it('runs the action when the limiter allows it', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([deployedRow])

    const response = await POST(actionRequest({ values: {} }), { params })

    expect(response.status).toBe(200)
    expect(mockRunAction).toHaveBeenCalled()
  })

  it('returns the limiter response and never runs the action', async () => {
    const limited = Response.json({ error: 'Too many requests' }, { status: 429 })
    mockCheckRateLimit.mockResolvedValue(limited)

    const response = await POST(actionRequest({ values: {} }), { params })

    expect(response.status).toBe(429)
    expect(mockRunAction).not.toHaveBeenCalled()
  })

  /**
   * The throttle must sit in front of the deployment lookup, or an unauthenticated
   * flood still costs one query per request.
   */
  it('throttles before touching the database', async () => {
    mockCheckRateLimit.mockResolvedValue(Response.json({ error: 'nope' }, { status: 429 }))

    await POST(actionRequest({ values: {} }), { params })

    expect(dbChainMockFns.limit).not.toHaveBeenCalled()
  })

  it('passes the app identifier to the limiter so buckets are per app', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([deployedRow])

    await POST(actionRequest({ values: {} }), { params })

    expect(mockCheckRateLimit).toHaveBeenCalledWith('lead-score', expect.anything())
  })
})
