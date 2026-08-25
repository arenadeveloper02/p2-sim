/**
 * @vitest-environment node
 */
import { dbChainMockFns, resetDbChainMock } from '@sim/testing'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/core/security/deployment-auth', () => ({
  validateDeploymentAuth: vi.fn(async () => ({ authorized: true })),
}))

import { GET, POST } from '@/app/api/gui-apps/[identifier]/route'

const deployedRow = {
  id: 'app-1',
  workspaceId: 'ws-1',
  workflowId: 'wf-1',
  userId: 'user-1',
  identifier: 'lead-score',
  title: 'Lead score',
  description: 'Qualify leads',
  department: null,
  isActive: true,
  authType: 'public',
  password: null,
  allowedEmails: [],
  requireArenaEmailId: true,
  draftId: 'draft-1',
  revisionId: 'rev-1',
  manifest: {
    entryPath: 'home',
    pages: { home: { title: 'Home', path: 'home', spec: { root: 'page', elements: {} } } },
    actions: {},
  },
  apiBindings: [],
  httpAllowlist: [],
  archivedAt: null,
}

describe('Deployed app config route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
  })

  it('returns 404 when the identifier is unknown', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([])
    const req = new NextRequest('http://localhost:3000/api/gui-apps/missing')
    const response = await GET(req, { params: Promise.resolve({ identifier: 'missing' }) })
    expect(response.status).toBe(404)
  })

  it('returns 403 when Arena emailId is required and missing', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([deployedRow])
    const req = new NextRequest('http://localhost:3000/api/gui-apps/lead-score')
    const response = await GET(req, { params: Promise.resolve({ identifier: 'lead-score' }) })
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toMatch(/access/i)
  })

  it('does not hard-deny an email-gated app that is missing Arena emailId', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([{ ...deployedRow, authType: 'email' }])
    const req = new NextRequest('http://localhost:3000/api/gui-apps/lead-score')
    const response = await GET(req, { params: Promise.resolve({ identifier: 'lead-score' }) })
    expect(response.status).toBe(200)
  })

  it('returns config when emailId is present', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([deployedRow])
    const req = new NextRequest(
      'http://localhost:3000/api/gui-apps/lead-score?emailId=user@example.com'
    )
    const response = await GET(req, { params: Promise.resolve({ identifier: 'lead-score' }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.entryPath).toBe('home')
    expect(body.title).toBe('Lead score')
    expect(body.uxPlan).toEqual({ actions: {}, fallbackLoading: {} })
  })

  it('returns config without emailId when the Arena gate is off', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([{ ...deployedRow, requireArenaEmailId: false }])
    const req = new NextRequest('http://localhost:3000/api/gui-apps/lead-score')
    const response = await GET(req, { params: Promise.resolve({ identifier: 'lead-score' }) })
    expect(response.status).toBe(200)
  })
})

describe('Deployed app auth POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
  })

  it('authenticates a public app with emailId', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([{ ...deployedRow, requireArenaEmailId: false }])
    const req = new NextRequest('http://localhost:3000/api/gui-apps/lead-score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const response = await POST(req, { params: Promise.resolve({ identifier: 'lead-score' }) })
    expect(response.status).toBe(200)
  })
})
