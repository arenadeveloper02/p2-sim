/**
 * @vitest-environment node
 */
import type { Spec } from '@json-render/core'
import { dbChainMockFns, resetDbChainMock } from '@sim/testing'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/core/security/deployment-auth', () => ({
  validateDeploymentAuth: vi.fn(async () => ({ authorized: true })),
}))

import { GET } from '@/app/api/gui-apps/[identifier]/pages/[path]/route'

const homeWithSteps: Spec = {
  root: 'page',
  elements: {
    page: { type: 'Page', props: { title: 'Form' }, children: ['section'] },
    section: {
      type: 'Section',
      props: { padding: null, backgroundColor: null, maxWidth: null },
      children: ['form', 'steps'],
    },
    form: { type: 'Form', props: { actionId: 'submit_lead' }, children: ['submit'] },
    submit: {
      type: 'SubmitButton',
      props: { label: 'Submit', actionId: null, size: null, variant: null, shape: null },
      children: [],
    },
    steps: {
      type: 'ProgressSteps',
      props: { steps: 'Connecting\nScoring' },
      children: [],
    },
  },
}

const resultsBare: Spec = {
  root: 'page',
  elements: {
    page: { type: 'Page', props: { title: 'Results' }, children: ['section'] },
    section: {
      type: 'Section',
      props: { padding: null, backgroundColor: null, maxWidth: null },
      children: ['heading'],
    },
    heading: { type: 'Heading', props: { text: 'Score', level: 'h2' }, children: [] },
  },
}

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
  requireArenaEmailId: false,
  draftId: 'draft-1',
  revisionId: 'rev-1',
  manifest: {
    entryPath: 'home',
    pages: {
      home: { title: 'Form', path: 'home', spec: homeWithSteps },
      results: { title: 'Score', path: 'results', spec: resultsBare },
    },
    actions: {
      submit_lead: { apiKey: 'qualify_lead', onSuccess: { navigate: 'results' } },
    },
  },
  apiBindings: [{ key: 'qualify_lead', label: 'Qualify', kind: 'workflow', workflowId: 'wf-1' }],
  httpAllowlist: [],
  archivedAt: null,
}

function pageRequest(path: string) {
  return new NextRequest(`http://localhost:3000/api/gui-apps/lead-score/pages/${path}`)
}

describe('Deployed app page route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
  })

  it('returns 404 when the identifier is unknown', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([])
    const response = await GET(pageRequest('home'), {
      params: Promise.resolve({ identifier: 'lead-score', path: 'home' }),
    })
    expect(response.status).toBe(404)
  })

  it('returns 404 when the page path is missing', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([deployedRow])
    const response = await GET(pageRequest('missing'), {
      params: Promise.resolve({ identifier: 'lead-score', path: 'missing' }),
    })
    expect(response.status).toBe(404)
  })

  it('compiles with relocate so ProgressSteps leave the form page', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([deployedRow])
    const response = await GET(pageRequest('home'), {
      params: Promise.resolve({ identifier: 'lead-score', path: 'home' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    const types = Object.values(body.spec.elements ?? {}).map(
      (element) => (element as { type?: string }).type
    )
    expect(types).not.toContain('ProgressSteps')
  })

  it('compiles with relocate so ProgressSteps land on the destination page', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([deployedRow])
    const response = await GET(pageRequest('results'), {
      params: Promise.resolve({ identifier: 'lead-score', path: 'results' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    const types = Object.values(body.spec.elements ?? {}).map(
      (element) => (element as { type?: string }).type
    )
    expect(types).toContain('ProgressSteps')
  })
})
