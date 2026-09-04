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
    expect(body.screenshotMatchNotes).toBeNull()
    expect(body.generateWarnings).toEqual([])
    expect(body.adoptedChanges).toEqual([])
    expect(body.capabilities).toEqual([])
    expect(body.screenshotGaps).toEqual([])
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

  it('returns screenshot match notes when a visual brief was stored', async () => {
    dbChainMockFns.limit
      .mockResolvedValueOnce([
        {
          ...draftRow,
          structuredBrief: {
            title: 'Lead qualifier',
            visualBrief: {
              screens: [{ purpose: 'Form', visibleCopy: ['Submit'] }],
              layout: {},
              catalogMapping: [],
              unrepresentable: [
                {
                  observed: 'glass cards',
                  closestCatalogType: 'Card',
                  reason: 'No glassmorphism',
                },
              ],
            },
          },
        },
      ])
      .mockResolvedValueOnce([{ id: 'rev-1' }])
    const req = new NextRequest('http://localhost:3000/api/gui-apps/drafts/draft-1')
    const response = await GET(req, { params: Promise.resolve({ id: 'draft-1' }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.screenshotMatchNotes).toContain('glass cards')
    expect(body.screenshotGaps).toEqual([
      {
        observed: 'glass cards',
        closestCatalogType: 'Card',
      },
    ])
  })

  it('returns planner capabilities stored on the structured brief', async () => {
    dbChainMockFns.limit
      .mockResolvedValueOnce([
        {
          ...draftRow,
          structuredBrief: {
            title: 'Orders',
            purpose: 'Browse orders',
            audience: 'Ops',
            archetype: 'collection',
            entryPath: 'home',
            pages: [
              { path: 'home', title: 'Orders', purpose: 'List', data: 'onLoad load_orders' },
            ],
            actions: [],
            capabilities: ['search', 'chat'],
          },
        },
      ])
      .mockResolvedValueOnce([{ id: 'rev-1' }])
    const req = new NextRequest('http://localhost:3000/api/gui-apps/drafts/draft-1')
    const response = await GET(req, { params: Promise.resolve({ id: 'draft-1' }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.capabilities).toEqual(['search', 'chat'])
  })

  it('returns generate warnings stored on the structured-brief jsonb', async () => {
    dbChainMockFns.limit
      .mockResolvedValueOnce([
        {
          ...draftRow,
          structuredBrief: {
            title: 'Lead qualifier',
            generateWarnings: [
              {
                code: 'planner-failed',
                message: 'Planner failed (bad json); generated from the prose brief.',
              },
            ],
          },
        },
      ])
      .mockResolvedValueOnce([{ id: 'rev-1' }])
    const req = new NextRequest('http://localhost:3000/api/gui-apps/drafts/draft-1')
    const response = await GET(req, { params: Promise.resolve({ id: 'draft-1' }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.generateWarnings).toEqual([
      {
        code: 'planner-failed',
        message: 'Planner failed (bad json); generated from the prose brief.',
      },
    ])
    expect(body.adoptedChanges).toEqual([])
    expect(body.capabilities).toEqual([])
  })

  it('returns adopted changes stored on the structured-brief jsonb', async () => {
    dbChainMockFns.limit
      .mockResolvedValueOnce([
        {
          ...draftRow,
          structuredBrief: {
            title: 'Lead qualifier',
            adoptedChanges: [
              {
                code: 'extra-primary',
                asked: 'Section "section" on page "home" had more than one primary action (submit, go).',
                adopted: 'Kept "submit" as primary; changed "go" to a secondary Button.',
              },
            ],
          },
        },
      ])
      .mockResolvedValueOnce([{ id: 'rev-1' }])
    const req = new NextRequest('http://localhost:3000/api/gui-apps/drafts/draft-1')
    const response = await GET(req, { params: Promise.resolve({ id: 'draft-1' }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.adoptedChanges).toEqual([
      {
        code: 'extra-primary',
        asked: 'Section "section" on page "home" had more than one primary action (submit, go).',
        adopted: 'Kept "submit" as primary; changed "go" to a secondary Button.',
      },
    ])
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
