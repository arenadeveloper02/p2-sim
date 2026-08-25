/**
 * @vitest-environment node
 */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockValidateWorkflowAccess,
  mockLoadDeployedWorkflowState,
  mockLoadLastSuccessfulRunOutputSchema,
} = vi.hoisted(() => ({
  mockValidateWorkflowAccess: vi.fn(),
  mockLoadDeployedWorkflowState: vi.fn(),
  mockLoadLastSuccessfulRunOutputSchema: vi.fn(),
}))

vi.mock('@/app/api/workflows/middleware', () => ({
  validateWorkflowAccess: mockValidateWorkflowAccess,
}))

vi.mock('@/lib/workflows/persistence/utils', () => ({
  loadDeployedWorkflowState: mockLoadDeployedWorkflowState,
}))

vi.mock('@/lib/arena-generative-ui/last-run-output-schema', () => ({
  loadLastSuccessfulRunOutputSchema: mockLoadLastSuccessfulRunOutputSchema,
}))

import { GET } from './route'

const routeParams = () => ({ params: Promise.resolve({ id: 'wf-history' }) })

function createRequest() {
  return new NextRequest(
    'http://localhost:3000/api/workflows/wf-history/last-successful-output-schema'
  )
}

describe('GET /api/workflows/[id]/last-successful-output-schema', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadDeployedWorkflowState.mockResolvedValue({ deploymentVersionId: 'deploy-current' })
    mockLoadLastSuccessfulRunOutputSchema.mockResolvedValue({
      fields: [{ name: 'run_data.history', type: 'array' }],
      warnings: [],
      found: true,
    })
  })

  it('returns 401 when the caller cannot read the workflow', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      error: { message: 'Unauthorized', status: 401 },
    })

    const response = await GET(createRequest(), routeParams())

    expect(response.status).toBe(401)
    expect(mockLoadLastSuccessfulRunOutputSchema).not.toHaveBeenCalled()
  })

  it('returns last-run fields and forwards the active deployment version', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-history' },
    })

    const response = await GET(createRequest(), routeParams())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      outputSchema: [{ name: 'run_data.history', type: 'array' }],
      warnings: [],
      found: true,
    })
    expect(mockLoadLastSuccessfulRunOutputSchema).toHaveBeenCalledWith('wf-history', {
      activeDeploymentVersionId: 'deploy-current',
    })
  })

  it('still reads last-run schema when the workflow is not deployed', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-history' },
    })
    mockLoadDeployedWorkflowState.mockRejectedValue(new Error('no active deployment'))

    const response = await GET(createRequest(), routeParams())

    expect(response.status).toBe(200)
    expect(mockLoadLastSuccessfulRunOutputSchema).toHaveBeenCalledWith('wf-history', {
      activeDeploymentVersionId: null,
    })
  })
})
