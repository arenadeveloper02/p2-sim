/**
 * @vitest-environment node
 */
import { authMockFns, dbChainMockFns, resetDbChainMock } from '@sim/testing'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckWorkflowAccess } = vi.hoisted(() => ({
  mockCheckWorkflowAccess: vi.fn(),
}))

vi.mock('@/app/api/chat/utils', () => ({
  checkWorkflowAccessForChatCreation: mockCheckWorkflowAccess,
}))

import { twoPageApiBindings, twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'
import { GET } from '@/app/api/gui-apps/drafts/[id]/route'

const draftRow = {
  id: 'draft-1',
  workspaceId: 'ws-1',
  workflowId: 'wf-1',
  userId: 'owner-1',
  title: 'Lead qualifier',
  entryPath: 'home',
  revision: 1,
  manifest: twoPageManifest,
  apiBindings: twoPageApiBindings,
}

describe('Generative app draft GET (two-page app)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    authMockFns.mockGetSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockCheckWorkflowAccess.mockResolvedValue({ hasAccess: true })
  })

  it('returns both pages and the manifest for an accessible draft', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([draftRow]).mockResolvedValueOnce([{ id: 'rev-1' }])
    const req = new NextRequest('http://localhost:3000/api/gui-apps/drafts/draft-1')
    const response = await GET(req, { params: Promise.resolve({ id: 'draft-1' }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.entryPath).toBe('home')
    expect(body.pages).toEqual([
      { path: 'home', title: 'Form' },
      { path: 'results', title: 'Score' },
    ])
    expect(body.manifest.pages.home.path).toBe('home')
    expect(body.manifest.pages.results.path).toBe('results')
    expect(body.manifest.actions.submit_lead.onSuccess.navigate).toBe('results')
    expect(body.revisionDiff).toBeNull()
    expect(body.brief).toBeNull()
  })

  it('returns the original generate brief when the draft stored one', async () => {
    dbChainMockFns.limit
      .mockResolvedValueOnce([{ ...draftRow, brief: 'Lead qualifier with home and results' }])
      .mockResolvedValueOnce([{ id: 'rev-1' }])
    const req = new NextRequest('http://localhost:3000/api/gui-apps/drafts/draft-1')
    const response = await GET(req, { params: Promise.resolve({ id: 'draft-1' }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.brief).toBe('Lead qualifier with home and results')
  })

  it('summarizes what changed since the previous revision', async () => {
    const previousManifest = twoPageManifest
    const nextManifest = {
      ...twoPageManifest,
      pages: {
        ...twoPageManifest.pages,
        home: { ...twoPageManifest.pages.home, title: 'Updated form' },
      },
    }
    dbChainMockFns.limit
      .mockResolvedValueOnce([{ ...draftRow, revision: 2, manifest: nextManifest }])
      .mockResolvedValueOnce([{ id: 'rev-2' }])
      .mockResolvedValueOnce([{ manifest: previousManifest, revision: 1 }])
    const req = new NextRequest('http://localhost:3000/api/gui-apps/drafts/draft-1')
    const response = await GET(req, { params: Promise.resolve({ id: 'draft-1' }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.revisionDiff.fromRevision).toBe(1)
    expect(body.revisionDiff.toRevision).toBe(2)
    expect(body.revisionDiff.pagesChanged).toEqual(['home'])
    expect(body.revisionDiff.summary).toContain('r1 → r2')
  })
})
