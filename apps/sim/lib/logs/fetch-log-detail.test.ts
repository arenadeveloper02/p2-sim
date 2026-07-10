/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAdditiveCostLeaves } from '@/lib/logs/fetch-log-detail'
import type { CostLedgerItem } from '@/lib/api/contracts/logs'
import type { TraceSpan } from '@/lib/logs/types'

const { selectMock, checkWorkspaceAccessMock, materializeExecutionDataMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  checkWorkspaceAccessMock: vi.fn(),
  materializeExecutionDataMock: vi.fn(),
}))

vi.mock('@sim/db', () => ({
  db: { select: selectMock },
}))

vi.mock('@/lib/logs/execution/trace-store', () => ({
  materializeExecutionData: materializeExecutionDataMock,
}))

vi.mock('@/lib/workspaces/permissions/utils', () => ({
  checkWorkspaceAccess: checkWorkspaceAccessMock,
}))

import { fetchLogDetail } from '@/lib/logs/fetch-log-detail'

function builder(rows: unknown[]) {
  const chain: Record<string, unknown> = {}
  for (const method of ['from', 'leftJoin', 'where', 'limit']) {
    chain[method] = () => chain
  }
  ;(chain as { then: unknown }).then = (resolve: (value: unknown) => unknown) => resolve(rows)
  return chain
}

describe('buildAdditiveCostLeaves', () => {
  it('produces additive leaves that reconcile to the ledger total', () => {
    const items: CostLedgerItem[] = [
      { category: 'fixed', description: 'execution_fee', cost: 0.005 },
      {
        category: 'model',
        description: 'gpt-5.5',
        cost: 0.1,
        toolCost: 0.04,
        embeddedTools: [{ name: 'image_generate', cost: 0.04 }],
      },
      { category: 'tool', description: 'exa_search', cost: 0.01 },
      { category: 'external', description: 'Vendor API', cost: 0.02 },
    ]

    const leaves = buildAdditiveCostLeaves(items)
    const leafTotal = leaves.reduce((sum, leaf) => sum + leaf.dollars, 0)

    expect(leafTotal).toBeCloseTo(0.135, 8)
    expect(leaves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ group: 'base', label: 'Base Run', dollars: 0.005 }),
        expect.objectContaining({
          group: 'model',
          label: 'gpt-5.5',
          dollars: expect.closeTo(0.06, 8),
        }),
        expect.objectContaining({ group: 'tool', label: 'Image Generator', dollars: 0.04 }),
        expect.objectContaining({ group: 'tool', label: 'Exa Search', dollars: 0.01 }),
        expect.objectContaining({ group: 'other', label: 'Vendor API', dollars: 0.02 }),
      ])
    )
  })

  it('uses trace fallback and unattributed remainder for legacy model rows', () => {
    const traceSpans: TraceSpan[] = [
      {
        id: 'agent',
        name: 'Agent',
        type: 'agent',
        model: 'gpt-5.5',
        children: [
          {
            id: 'tool-1',
            name: 'image_generate',
            type: 'tool',
            output: { cost: { total: 0.03 } },
          },
        ],
      },
    ]

    const leaves = buildAdditiveCostLeaves(
      [{ category: 'model', description: 'gpt-5.5', cost: 0.08, toolCost: 0.05 }],
      traceSpans
    )

    expect(leaves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ group: 'model', dollars: expect.closeTo(0.03, 8) }),
        expect.objectContaining({
          group: 'tool',
          label: 'Image Generator',
          dollars: expect.closeTo(0.03, 8),
        }),
        expect.objectContaining({
          group: 'tool',
          label: 'Unattributed agent tools',
          dollars: expect.closeTo(0.02, 8),
        }),
      ])
    )
  })
})

describe('fetchLogDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkWorkspaceAccessMock.mockResolvedValue({ hasAccess: true })
    materializeExecutionDataMock.mockResolvedValue({})
  })

  it('exposes cumulative embedded tool cost on the model ledger item', async () => {
    selectMock
      .mockReturnValueOnce(
        builder([
          {
            id: 'log-1',
            workflowId: 'workflow-1',
            executionId: 'execution-1',
            deploymentVersionId: null,
            level: 'info',
            status: 'completed',
            trigger: 'manual',
            startedAt: new Date('2026-07-10T07:52:10.638Z'),
            endedAt: new Date('2026-07-10T07:52:43.043Z'),
            totalDurationMs: 32405,
            executionData: {},
            costTotal: '0.16658',
            files: null,
            createdAt: new Date('2026-07-10T07:52:10.638Z'),
            workflowName: 'Image workflow',
            workflowDescription: null,
            workflowFolderId: null,
            workflowUserId: 'user-1',
            workflowWorkspaceId: 'workspace-1',
            workflowCreatedAt: new Date('2026-07-10T07:00:00.000Z'),
            workflowUpdatedAt: new Date('2026-07-10T07:00:00.000Z'),
            deploymentVersion: null,
            deploymentVersionName: null,
            pausedStatus: null,
            pausedTotalPauseCount: 0,
            pausedResumedCount: 0,
          },
        ])
      )
      .mockReturnValueOnce(
        builder([
          {
            category: 'model',
            description: 'gpt-5.5',
            cost: '0.1',
            metadata: {
              inputTokens: 1000,
              outputTokens: 100,
              toolCost: 0.04,
              embeddedToolCosts: { image_generate: 0.04 },
            },
          },
          {
            category: 'model',
            description: 'gpt-5.5',
            cost: '0.06158',
            metadata: {
              inputTokens: 2000,
              outputTokens: 200,
              toolCost: 0.067,
              embeddedToolCosts: { image_generate: 0.067 },
            },
          },
          {
            category: 'fixed',
            description: 'execution_fee',
            cost: '0.005',
            metadata: null,
          },
        ])
      )

    const detail = await fetchLogDetail({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      lookupColumn: 'executionId',
      lookupValue: 'execution-1',
    })

    expect(detail?.costLedger?.items).toEqual([
      {
        category: 'model',
        description: 'gpt-5.5',
        cost: 0.16158,
        inputTokens: 2000,
        outputTokens: 200,
        toolCost: 0.067,
        embeddedTools: [{ name: 'image_generate', cost: 0.067 }],
      },
      {
        category: 'fixed',
        description: 'execution_fee',
        cost: 0.005,
      },
    ])

    const leafTotal = detail?.costLedger?.leaves.reduce((sum, leaf) => sum + leaf.dollars, 0) ?? 0
    expect(leafTotal).toBeCloseTo(0.16658, 8)
  })
})
