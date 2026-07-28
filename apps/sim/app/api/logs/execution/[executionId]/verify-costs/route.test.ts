/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCheckSessionOrInternalAuth,
  mockCheckWorkspaceAccess,
  mockComputeShadowRepriceForExecution,
  mockSelect,
  mockLimit,
} = vi.hoisted(() => {
  const mockLimit = vi.fn()
  const mockWhere = vi.fn(() => ({ limit: mockLimit }))
  const mockFrom = vi.fn(() => ({ where: mockWhere }))
  const mockSelect = vi.fn(() => ({ from: mockFrom }))
  return {
    mockCheckSessionOrInternalAuth: vi.fn(),
    mockCheckWorkspaceAccess: vi.fn(),
    mockComputeShadowRepriceForExecution: vi.fn(),
    mockSelect,
    mockLimit,
  }
})

vi.mock('@sim/db', () => ({
  db: {
    select: mockSelect,
  },
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkSessionOrInternalAuth: mockCheckSessionOrInternalAuth,
}))

vi.mock('@/lib/workspaces/permissions/utils', () => ({
  checkWorkspaceAccess: mockCheckWorkspaceAccess,
}))

vi.mock('@/lib/billing/core/historical-workflow-reconciliation', () => ({
  computeShadowRepriceForExecution: mockComputeShadowRepriceForExecution,
  toVerifyExecutionCostsResponse: (record: {
    executionId: string
    workflowId: string | null
    workspaceId: string
    confidence: string
    primaryClass: string
    applyEligible: boolean
    blockers: string[]
    warnings: string[]
    ledgerSum: number
    ledgerLines: Array<{ category: string; description: string; cost: number }>
    targetSum: number
    targets: Array<{
      category: string
      description: string
      target: number
      evidenceSource?: string
    }>
    positiveDelta: number
    negativeDelta: number
  }) => ({
    executionId: record.executionId,
    workflowId: record.workflowId,
    workspaceId: record.workspaceId,
    confidence: record.confidence,
    primaryClass: record.primaryClass,
    applyEligible: record.applyEligible,
    blockers: record.blockers,
    warnings: record.warnings,
    billed: { total: record.ledgerSum, lines: record.ledgerLines },
    expected: {
      total: record.targetSum,
      lines: record.targets.map((line) => ({
        category: line.category,
        description: line.description,
        target: line.target,
        ...(line.evidenceSource ? { evidenceSource: line.evidenceSource } : {}),
      })),
    },
    deltas: { positive: record.positiveDelta, negative: record.negativeDelta },
    onlyPricedTools: true as const,
  }),
}))

import { POST } from '@/app/api/logs/execution/[executionId]/verify-costs/route'

describe('POST /api/logs/execution/[executionId]/verify-costs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckSessionOrInternalAuth.mockResolvedValue({
      success: true,
      userId: 'user-1',
    })
    mockCheckWorkspaceAccess.mockResolvedValue({ hasAccess: true })
    mockLimit.mockResolvedValue([{ executionId: 'exec-1', workspaceId: 'ws-1' }])
    mockComputeShadowRepriceForExecution.mockResolvedValue({
      executionId: 'exec-1',
      workflowId: 'wf-1',
      workspaceId: 'ws-1',
      startedAt: '2024-01-01T00:00:00.000Z',
      status: 'completed',
      ledgerSum: 0.01,
      ledgerLines: [{ category: 'fixed', description: 'execution_fee', cost: 0.01 }],
      costTotal: 0.01,
      targetSum: 0.02,
      positiveDelta: 0.01,
      negativeDelta: 0,
      confidence: 'high',
      applyEligible: true,
      primaryClass: 'hosted_tool',
      warnings: [],
      blockers: [],
      targets: [
        {
          category: 'tool',
          description: 'exa_search',
          target: 0.01,
          evidenceSource: 'exa_cost_dollars',
        },
      ],
      pricingMode: 'current-catalog',
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockCheckSessionOrInternalAuth.mockResolvedValue({
      success: false,
      error: 'Authentication required',
    })

    const response = await POST(createMockRequest('POST'), {
      params: Promise.resolve({ executionId: 'exec-1' }),
    })

    expect(response.status).toBe(401)
    expect(mockComputeShadowRepriceForExecution).not.toHaveBeenCalled()
  })

  it('returns 404 when execution is missing', async () => {
    mockLimit.mockResolvedValue([])

    const response = await POST(createMockRequest('POST'), {
      params: Promise.resolve({ executionId: 'missing' }),
    })

    expect(response.status).toBe(404)
    expect(mockComputeShadowRepriceForExecution).not.toHaveBeenCalled()
  })

  it('returns 404 when workspace access is denied', async () => {
    mockCheckWorkspaceAccess.mockResolvedValue({ hasAccess: false })

    const response = await POST(createMockRequest('POST'), {
      params: Promise.resolve({ executionId: 'exec-1' }),
    })

    expect(response.status).toBe(404)
    expect(mockComputeShadowRepriceForExecution).not.toHaveBeenCalled()
  })

  it('returns shadow reprice payload with onlyPricedTools true', async () => {
    const response = await POST(createMockRequest('POST'), {
      params: Promise.resolve({ executionId: 'exec-1' }),
    })

    expect(response.status).toBe(200)
    expect(mockComputeShadowRepriceForExecution).toHaveBeenCalledWith('exec-1', {
      onlyPricedTools: true,
    })

    const body = await response.json()
    expect(body).toMatchObject({
      executionId: 'exec-1',
      workspaceId: 'ws-1',
      primaryClass: 'hosted_tool',
      onlyPricedTools: true,
      billed: { total: 0.01 },
      expected: { total: 0.02 },
      deltas: { positive: 0.01, negative: 0 },
    })
  })
})
